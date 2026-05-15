import { Namespace, Socket } from 'socket.io';
import type { ZodSchema } from 'zod';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import { calculateMatchElo, getRankTier, MatchEloResult } from './elo';
import { invalidateUserGlobalRank } from './leaderboard';
import { bufferQuestionServes } from './questionServeBuffer';
import { invalidateUserById } from './userCache';
import { gradeAnswer } from './answerGrading';
import { isAnswerForQuestionType } from './answerValidation';
import { botBusyKey, rollBotCorrect } from './botPlayer';
import { enforceSocketEventLimit } from './socketRateLimit';
import {
  socketAnswerSubmitPayloadSchema,
  socketGameIdPayloadSchema,
} from './socketPayloadSchemas';
import { getPoolIds, getQuestionsContent, contentKey, CONTENT_TTL } from './questionPool';
import { logger } from '../lib/logger';
import { Sentry, withSentry } from '../lib/sentry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerAnswerRecord {
  selected: number | null;
  typed: string | null;
  correct: boolean;
  timeMs: number;
}

interface AnswerKey {
  questionType: 'MCQ' | 'TITA';
  correctAnswer: number | null;
  correctAnswerText: string | null;
}

interface ResultsAnswerDetail {
  id: string;
  userId: string;
  questionId: string;
  selectedAnswer: number | null;
  typedAnswer: string | null;
  isCorrect: boolean;
  timeTakenMs: number;
  question: {
    id: string;
    category: string;
    questionType: string;
    subTopic: string | null;
    subType: string | null;
    text: string;
    options: unknown;
    correctAnswer: number | null;
    correctAnswerText: string | null;
    explanation: string;
    explanationImages: string[];
  };
}

export interface RatingImpact {
  win: number;
  loss: number;
}

export interface GamePlayerProfile {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  eloRating: number;
  gamesPlayed: number;
  winRate: number;
}

interface ClientPassage {
  id: string;
  text: string;
  images: string[];
}

interface ClientQuestion {
  id: string;
  category: 'QUANT' | 'DILR' | 'VARC';
  questionType: 'MCQ' | 'TITA';
  subTopic: string | null;
  subType: string | null;
  difficulty: number;
  text: string;
  options: unknown;
  passageId: string | null;
}

interface GameState {
  gameId: string;
  status: 'FOUND' | 'WAITING_FOR_PLAYERS' | 'COUNTDOWN' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  player1Id: string;
  player2Id: string;
  player1IsBot: boolean;
  player2IsBot: boolean;
  player1Profile: GamePlayerProfile;
  player2Profile: GamePlayerProfile;
  player1RatingImpact: RatingImpact;
  player2RatingImpact: RatingImpact;
  questionIds: string[];
  questions: Record<string, ClientQuestion>;
  answerKeys: Record<string, AnswerKey>; // server-only, never sent to clients
  passages: Record<string, ClientPassage>;
  player1Progress: number;
  player2Progress: number;
  player1Score: number;
  player2Score: number;
  player1Joined: boolean;
  player2Joined: boolean;
  player1Answers: Record<string, PlayerAnswerRecord>;
  player2Answers: Record<string, PlayerAnswerRecord>;
  durationSeconds: number;
  joinDeadlineAt: number | null;
  countdownStartedAt: number | null;
  startedAt: number | null;
  createdAt: number;
}

export type GamePlayer = { userId: string; elo: number };
export type PendingMatchPayload = {
  gameId: string;
  duration: number;
  opponent: GamePlayerProfile;
  ratingImpact: RatingImpact;
};
type MatchPersistUserStats = { gamesPlayed: number; wins: number; draws: number; peakElo: number };

function buildOpponentProgress(answered: number, totalQuestions: number) {
  if (answered <= 0) return null;

  return {
    currentQuestion: Math.min(answered + 1, totalQuestions),
    questionsAnswered: answered,
  };
}

async function buildResultsAnswers(state: GameState): Promise<ResultsAnswerDetail[]> {
  const answeredQuestionIds = state.questionIds.filter((questionId) =>
    state.player1Answers[questionId] || state.player2Answers[questionId]
  );

  const questions = await prisma.question.findMany({
    where: { id: { in: answeredQuestionIds } },
    select: {
      id: true,
      category: true,
      questionType: true,
      subTopic: true,
      subType: true,
      text: true,
      options: true,
      correctAnswer: true,
      correctAnswerText: true,
      explanation: true,
      explanationImages: true,
    },
  });
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const answers: ResultsAnswerDetail[] = [];

  function addAnswer(userId: string, questionId: string, record: PlayerAnswerRecord) {
    const question = questionById.get(questionId);
    if (!question) return;

    answers.push({
      id: `${state.gameId}:${userId}:${questionId}`,
      userId,
      questionId,
      selectedAnswer: record.selected,
      typedAnswer: record.typed,
      isCorrect: record.correct,
      timeTakenMs: record.timeMs,
      question,
    });
  }

  for (const questionId of state.questionIds) {
    const player1Answer = state.player1Answers[questionId];
    const player2Answer = state.player2Answers[questionId];
    if (player1Answer) addAnswer(state.player1Id, questionId, player1Answer);
    if (player2Answer) addAnswer(state.player2Id, questionId, player2Answer);
  }

  return answers;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTION_COUNT = 20;
const QUESTION_POOL_SAMPLE_PER_CATEGORY = 40;
const GAME_DURATION_SECONDS = env.GAME_DURATION_SECONDS;
const COUNTDOWN_SECONDS = 3;
const PRESTART_TIMEOUT_MS = 10_000;
const PRESTART_TTL_SECONDS = 30;
const ACTIVE_FORFEIT_GRACE_SECONDS = 15;
const SECTION_ORDER = ['QUANT', 'DILR', 'VARC'];

// In-memory timer maps. Both are lost on server restart; active games in Redis
// would need their timers re-initialized by scanning active_game:* keys on startup
// (deferred to a future hardening pass).
const activeTimers = new Map<string, NodeJS.Timeout>();
const botTimers = new Map<string, NodeJS.Timeout>();
const forfeitTimers = new Map<string, NodeJS.Timeout>(); // keyed by userId
const preStartTimers = new Map<string, NodeJS.Timeout>();
const countdownTimers = new Map<string, NodeJS.Timeout>();

function parseSocketPayload<T>(
  socket: Socket,
  eventName: string,
  schema: ZodSchema<T>,
  payload: unknown,
): T | null {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  const issues = result.error.issues.slice(0, 3).map((issue) => ({
    code: issue.code,
    path: issue.path.join('.'),
    message: issue.message,
  }));
  logger.warn(
    { event: eventName, userId: socket.data.user?.id, issues },
    'Invalid socket payload',
  );
  socket.emit('game:error', {
    code: 'VALIDATION_ERROR',
    message: result.error.issues[0]?.message ?? 'Invalid socket payload',
  });

  return null;
}

// ─── Redis helpers ─────────────────────────────────────────────────────────────

function gameStateKey(gameId: string) {
  return `game:${gameId}`;
}

function serializeGameStateFields(
  state: GameState,
  fields = Object.keys(state) as (keyof GameState)[],
) {
  const serialized: Record<string, string> = {};
  for (const field of fields) {
    serialized[field] = JSON.stringify(state[field]);
  }
  return serialized;
}

function parseGameStateHash(hash: Record<string, string>): GameState {
  const parsed: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(hash)) {
    parsed[field] = JSON.parse(value);
  }
  return parsed as unknown as GameState;
}

async function getGameState(gameId: string): Promise<GameState | null> {
  const key = gameStateKey(gameId);
  const type = await redis.type(key);
  if (type === 'none') return null;
  if (type === 'string') {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as GameState) : null;
  }
  if (type !== 'hash') return null;

  const hash = await redis.hgetall(key);
  if (Object.keys(hash).length === 0) return null;
  return parseGameStateHash(hash);
}

async function saveGameState(state: GameState, ttlSeconds = 1200): Promise<void> {
  const key = gameStateKey(state.gameId);
  if (await redis.type(key) === 'string') {
    await redis.del(key);
  }

  await redis
    .multi()
    .hset(key, serializeGameStateFields(state))
    .expire(key, ttlSeconds)
    .exec();
}

async function saveGameStateFields(
  state: GameState,
  fields: (keyof GameState)[],
  ttlSeconds = 1200,
): Promise<void> {
  if (fields.length === 0) return;

  const key = gameStateKey(state.gameId);
  const type = await redis.type(key);
  if (type === 'string' || type === 'none') {
    await saveGameState(state, ttlSeconds);
    return;
  }

  await redis
    .multi()
    .hset(key, serializeGameStateFields(state, fields))
    .expire(key, ttlSeconds)
    .exec();
}

async function markPreStartPlayerJoined(
  state: GameState,
  userId: string,
): Promise<{
  status: GameState['status'];
  player1Joined: boolean;
  player2Joined: boolean;
} | null> {
  const joinedField = state.player1Id === userId
    ? 'player1Joined'
    : state.player2Id === userId
      ? 'player2Joined'
      : null;

  if (!joinedField) return null;

  const key = gameStateKey(state.gameId);
  await redis
    .multi()
    .hset(key, {
      [joinedField]: JSON.stringify(true),
      status: JSON.stringify('WAITING_FOR_PLAYERS'),
    })
    .expire(key, getStateTtlSeconds(state))
    .exec();

  const readiness = await redis.hmget(
    key,
    'status',
    'player1Joined',
    'player2Joined',
  );
  const [statusRaw, player1JoinedRaw, player2JoinedRaw] = readiness;
  if (!statusRaw) return null;

  return {
    status: JSON.parse(statusRaw),
    player1Joined: player1JoinedRaw ? JSON.parse(player1JoinedRaw) : false,
    player2Joined: player2JoinedRaw ? JSON.parse(player2JoinedRaw) : false,
  };
}

function socketKey(userId: string) {
  return `socket:game:${userId}`;
}

function pendingMatchKey(userId: string) {
  return `pending_match:${userId}`;
}

function servedAtKey(gameId: string, userId: string, questionId: string) {
  return `served_at:${gameId}:${userId}:${questionId}`;
}

export function isAnswerLate(startedAt: number | null, durationSeconds: number, now = Date.now()): boolean {
  if (!startedAt) return false;
  return now > startedAt + durationSeconds * 1000;
}

function isPreStartStatus(status: GameState['status']) {
  return status === 'FOUND' || status === 'WAITING_FOR_PLAYERS' || status === 'COUNTDOWN';
}

function getStateTtlSeconds(state: GameState) {
  return isPreStartStatus(state.status) ? PRESTART_TTL_SECONDS : 1200;
}

function clearPreStartTimer(gameId: string) {
  const timer = preStartTimers.get(gameId);
  if (timer) clearTimeout(timer);
  preStartTimers.delete(gameId);
}

function clearCountdownTimer(gameId: string) {
  const timer = countdownTimers.get(gameId);
  if (timer) clearTimeout(timer);
  countdownTimers.delete(gameId);
}

function clearForfeitTimer(userId: string) {
  const timer = forfeitTimers.get(userId);
  if (timer) clearTimeout(timer);
  forfeitTimers.delete(userId);
}

function clearBotTimer(gameId: string) {
  const timer = botTimers.get(gameId);
  if (timer) clearTimeout(timer);
  botTimers.delete(gameId);
}

function isPlayer1(state: GameState, userId: string) {
  return state.player1Id === userId;
}

function isParticipant(state: GameState, userId: string) {
  return state.player1Id === userId || state.player2Id === userId;
}

function bothPlayersJoined(state: GameState) {
  return state.player1Joined && state.player2Joined;
}

function setJoined(state: GameState, userId: string, joined: boolean) {
  if (state.player1Id === userId) state.player1Joined = joined;
  if (state.player2Id === userId) state.player2Joined = joined;
}

function buildPendingMatchPayload(
  state: GameState,
  userId: string,
): PendingMatchPayload {
  const isP1 = isPlayer1(state, userId);

  return {
    gameId: state.gameId,
    duration: state.durationSeconds,
    opponent: isP1 ? state.player2Profile : state.player1Profile,
    ratingImpact: isP1 ? state.player1RatingImpact : state.player2RatingImpact,
  };
}

async function emitToUser(
  gameNs: Namespace,
  userId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const targetSocketId = await redis.get(socketKey(userId));
  if (targetSocketId) {
    gameNs.to(targetSocketId).emit(event, payload);
  }
}

async function emitToParticipants(
  gameNs: Namespace,
  state: GameState,
  event: string,
  payload: unknown,
): Promise<void> {
  await Promise.all([
    emitToUser(gameNs, state.player1Id, event, payload),
    emitToUser(gameNs, state.player2Id, event, payload),
  ]);
}

async function clearPreStartState(state: GameState): Promise<void> {
  clearPreStartTimer(state.gameId);
  clearCountdownTimer(state.gameId);

  await redis.del(
    pendingMatchKey(state.player1Id),
    pendingMatchKey(state.player2Id),
    `game:${state.gameId}`,
    `game:${state.gameId}:starting`,
    `game:${state.gameId}:ending`,
    `game:${state.gameId}:cancelling`,
    `active_game:${state.player1Id}`,
    `active_game:${state.player2Id}`,
  );
}

async function cancelPreStartGame(
  gameId: string,
  gameNs: Namespace,
  reason: 'join_timeout' | 'opponent_left' | 'cancelled',
  excludedRequeueUserId?: string,
): Promise<void> {
  const lock = await redis.set(`game:${gameId}:cancelling`, '1', 'EX', 30, 'NX');
  if (!lock) return;

  const state = await getGameState(gameId);
  if (!state || !isPreStartStatus(state.status)) return;

  state.status = 'CANCELLED';
  await saveGameStateFields(state, ['status'], getStateTtlSeconds(state));

  await emitToParticipants(gameNs, state, 'match:cancelled', { gameId, reason });

  const requeueTargets = [
    state.player1Joined ? state.player1Id : null,
    state.player2Joined ? state.player2Id : null,
  ].filter((value): value is string => (
    value != null &&
    value !== excludedRequeueUserId &&
    !(state.player2IsBot && value === state.player2Id)
  ));

  await Promise.all(
    requeueTargets.map((userId) =>
      emitToUser(gameNs, userId, 'match:requeueing', { gameId, reason }),
    ),
  );

  await clearPreStartState(state);
  if (state.player2IsBot) {
    await redis.del(botBusyKey(state.player2Id));
  }
}

async function schedulePreStartTimeout(
  gameId: string,
  joinDeadlineAt: number,
  gameNs: Namespace,
): Promise<void> {
  clearPreStartTimer(gameId);
  const delay = Math.max(joinDeadlineAt - Date.now(), 0);
  const timer = setTimeout(() => {
    cancelPreStartGame(gameId, gameNs, 'join_timeout').catch((err) => {
      Sentry.captureException(err, { extra: { gameId } });
      logger.error({ err, gameId }, 'Pre-start timeout error');
    });
  }, delay);
  preStartTimers.set(gameId, timer);
}

// ─── Question selection ────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Round-robin across categories until `total` questions are selected.
function balanceByCategory<T extends { category: string }>(
  questions: T[],
  total: number,
): T[] {
  const groups: Record<string, T[]> = {};
  for (const q of questions) {
    (groups[q.category] ??= []).push(q);
  }
  for (const category of Object.keys(groups)) {
    groups[category] = shuffle(groups[category]);
  }

  const result: T[] = [];
  const categories = SECTION_ORDER.filter((category) => groups[category]?.length);
  let round = 0;

  while (result.length < total) {
    let added = false;
    for (const cat of categories) {
      if (result.length >= total) break;
      if (round < groups[cat].length) {
        result.push(groups[cat][round]);
        added = true;
      }
    }
    if (!added) break; // No more questions available across all categories
    round++;
  }

  return result;
}

async function selectQuestionsForMatch(
  p1Elo: number,
  p2Elo: number,
): Promise<{
  questionIds: string[];
  questions: Record<string, ClientQuestion>;
  answerKeys: Record<string, AnswerKey>;
  passages: Record<string, ClientPassage>;
}> {
  const avgElo = (p1Elo + p2Elo) / 2;

  let minDiff: number, maxDiff: number;
  if (avgElo < 1000)      { minDiff = 1; maxDiff = 2; }
  else if (avgElo < 1300) { minDiff = 2; maxDiff = 3; }
  else if (avgElo < 1600) { minDiff = 3; maxDiff = 4; }
  else                    { minDiff = 4; maxDiff = 5; }

  // Pool path: get IDs from Redis sorted sets, fetch content from cache
  const candidates: { id: string; category: string }[] = [];
  for (const cat of SECTION_ORDER) {
    const ids = await getPoolIds(cat, minDiff, maxDiff, QUESTION_POOL_SAMPLE_PER_CATEGORY);
    for (const id of ids) candidates.push({ id, category: cat });
  }

  if (candidates.length >= QUESTION_COUNT) {
    const selected = balanceByCategory(candidates, QUESTION_COUNT);
    const contentMap = await getQuestionsContent(selected.map((s) => s.id));

    const questionIds: string[] = [];
    const clientQuestions: Record<string, ClientQuestion> = {};
    const answerKeys: Record<string, AnswerKey> = {};
    const passages: Record<string, ClientPassage> = {};

    for (const { id } of selected) {
      const q = contentMap.get(id);
      if (!q) continue;
      questionIds.push(id);
      clientQuestions[id] = {
        id: q.id,
        category: q.category as ClientQuestion['category'],
        questionType: q.questionType as ClientQuestion['questionType'],
        subTopic: q.subTopic,
        subType: q.subType,
        difficulty: q.difficulty,
        text: q.text,
        options: q.options,
        passageId: q.passageId,
      };
      answerKeys[id] = {
        questionType: q.questionType as AnswerKey['questionType'],
        correctAnswer: q.correctAnswer,
        correctAnswerText: q.correctAnswerText,
      };
      if (q.passage) passages[q.passage.id] = q.passage;
    }

    if (questionIds.length >= QUESTION_COUNT) {
      return { questionIds, questions: clientQuestions, answerKeys, passages };
    }
  }

  // Fallback: pool missing or too sparse — query DB directly (capped at 200)
  const questionRows = await prisma.question.findMany({
    where: { isVerified: true, difficulty: { gte: minDiff, lte: maxDiff } },
    take: 200,
    select: {
      id: true,
      category: true,
      questionType: true,
      subTopic: true,
      subType: true,
      difficulty: true,
      text: true,
      options: true,
      correctAnswer: true,
      correctAnswerText: true,
      passageId: true,
      passage: { select: { id: true, text: true, images: true } },
    },
  });

  const balanced = balanceByCategory(questionRows, QUESTION_COUNT);

  const questionIds: string[] = [];
  const clientQuestions: Record<string, ClientQuestion> = {};
  const answerKeys: Record<string, AnswerKey> = {};
  const passages: Record<string, ClientPassage> = {};
  const pipeline = redis.pipeline();

  for (const q of balanced) {
    questionIds.push(q.id);
    clientQuestions[q.id] = {
      id: q.id,
      category: q.category as ClientQuestion['category'],
      questionType: q.questionType as ClientQuestion['questionType'],
      subTopic: q.subTopic,
      subType: q.subType,
      difficulty: q.difficulty,
      text: q.text,
      options: q.options,
      passageId: q.passageId,
    };
    answerKeys[q.id] = {
      questionType: q.questionType as AnswerKey['questionType'],
      correctAnswer: q.correctAnswer,
      correctAnswerText: q.correctAnswerText,
    };
    if (q.passage) passages[q.passage.id] = q.passage;
    pipeline.set(
      contentKey(q.id),
      JSON.stringify({ ...q, passage: q.passage ?? null }),
      'EX',
      CONTENT_TTL,
    );
  }

  await pipeline.exec();
  return { questionIds, questions: clientQuestions, answerKeys, passages };
}

// ─── Client-safe question (no correctAnswer or explanation) ───────────────────

function withPassage<T extends { passageId: string | null }>(
  question: T,
  passages: Record<string, ClientPassage>,
): T & { passage: ClientPassage | null } {
  return {
    ...question,
    passage: question.passageId ? (passages[question.passageId] ?? null) : null,
  };
}

async function incrementQuestionServeCounts(questionIds: string[]): Promise<void> {
  await bufferQuestionServes(questionIds);
}

// ─── Game lifecycle ────────────────────────────────────────────────────────────

function wrongMcqAnswer(correctAnswer: number | null): number {
  const options = [0, 1, 2, 3].filter((option) => option !== correctAnswer);
  return options[Math.floor(Math.random() * options.length)];
}

function botAnswerForQuestion(
  state: GameState,
  questionId: string,
): { selectedAnswer: number | null; typedAnswer: string | null; isCorrect: boolean } | null {
  const answerKey = state.answerKeys[questionId];
  const question = state.questions[questionId];
  if (!answerKey || !question) return null;

  const isCorrect = rollBotCorrect(
    state.player1Profile.eloRating,
    state.player2Profile.eloRating,
  );

  if (answerKey.questionType === 'MCQ') {
    const selectedAnswer = isCorrect
      ? answerKey.correctAnswer
      : wrongMcqAnswer(answerKey.correctAnswer);
    if (!isAnswerForQuestionType(answerKey.questionType, { selectedAnswer })) return null;
    return { selectedAnswer, typedAnswer: null, isCorrect };
  }

  const typedAnswer = isCorrect
    ? answerKey.correctAnswerText
    : '__incorrect__';
  if (!isAnswerForQuestionType(answerKey.questionType, { typedAnswer })) return null;
  return { selectedAnswer: null, typedAnswer, isCorrect };
}

export async function autojoinBotPlayer(
  gameId: string,
  botId: string,
  gameNs: Namespace,
): Promise<void> {
  const state = await getGameState(gameId);
  if (
    !state ||
    (state.status !== 'FOUND' && state.status !== 'WAITING_FOR_PLAYERS') ||
    !isParticipant(state, botId)
  ) {
    return;
  }

  const readiness = await markPreStartPlayerJoined(state, botId);
  if (
    !readiness ||
    !readiness.player1Joined ||
    !readiness.player2Joined ||
    (readiness.status !== 'FOUND' && readiness.status !== 'WAITING_FOR_PLAYERS')
  ) {
    return;
  }

  const lock = await redis.set(
    `game:${gameId}:starting`,
    '1',
    'EX',
    30,
    'NX',
  );
  if (!lock) return;

  const latestState = await getGameState(gameId);
  if (
    latestState &&
    latestState.status === 'WAITING_FOR_PLAYERS' &&
    bothPlayersJoined(latestState)
  ) {
    await startCountdown(gameId, latestState, gameNs);
  }
}

export async function submitBotAnswer(
  gameId: string,
  botId: string,
  delayMs: number,
  gameNs: Namespace,
): Promise<void> {
  const state = await getGameState(gameId);
  if (
    !state ||
    state.status !== 'ACTIVE' ||
    !state.player2IsBot ||
    state.player2Id !== botId
  ) {
    return;
  }

  const questionId = state.questionIds[state.player2Progress];
  if (!questionId || state.player2Answers[questionId]) return;

  const answer = botAnswerForQuestion(state, questionId);
  if (!answer) return;

  state.player2Answers[questionId] = {
    selected: answer.selectedAnswer,
    typed: answer.typedAnswer,
    correct: answer.isCorrect,
    timeMs: delayMs,
  };
  state.player2Progress += 1;
  if (answer.isCorrect) state.player2Score += 1;

  const changedFields: (keyof GameState)[] = ['player2Answers', 'player2Progress'];
  if (answer.isCorrect) changedFields.push('player2Score');
  await saveGameStateFields(state, changedFields);

  gameNs.to(gameId).emit('opponent:scored', {
    opponentScore: state.player2Score,
  });
  gameNs.to(gameId).emit(
    'opponent:progress',
    buildOpponentProgress(state.player2Progress, state.questionIds.length),
  );

  if (
    state.player1Progress >= state.questionIds.length &&
    state.player2Progress >= state.questionIds.length
  ) {
    await endGame(gameId, gameNs);
    return;
  }

  if (state.player2Progress < state.questionIds.length) {
    startBotAnswering(gameId, botId, gameNs);
  }
}

export function startBotAnswering(
  gameId: string,
  botId: string,
  gameNs: Namespace,
): void {
  clearBotTimer(gameId);
  const delayMs = 30_000 + Math.floor(Math.random() * 60_001);
  const timer = setTimeout(() => {
    if (botTimers.get(gameId) !== timer) return;
    botTimers.delete(gameId);
    submitBotAnswer(gameId, botId, delayMs, gameNs).catch((err) => {
      Sentry.captureException(err, { extra: { gameId, botId } });
      logger.error({ err, gameId, botId }, 'Bot answer error');
    });
  }, delayMs);
  botTimers.set(gameId, timer);
}

async function startCountdown(
  gameId: string,
  state: GameState,
  gameNs: Namespace,
): Promise<void> {
  clearPreStartTimer(gameId);
  clearCountdownTimer(gameId);

  state.status = 'COUNTDOWN';
  state.countdownStartedAt = Date.now();
  await saveGameState(state, getStateTtlSeconds(state));

  await emitToParticipants(gameNs, state, 'match:status', {
    gameId,
    status: 'countdown',
    seconds: COUNTDOWN_SECONDS,
  });
  gameNs.to(gameId).emit('game:countdown', { seconds: COUNTDOWN_SECONDS });

  const timer = setTimeout(async () => {
    countdownTimers.delete(gameId);

    // Re-read from Redis — state may have changed (e.g. both players disconnected)
    const current = await getGameState(gameId);
    if (!current || current.status !== 'COUNTDOWN' || !bothPlayersJoined(current)) return;
    if (await redis.get(`game:${gameId}:cancelling`)) return;

    current.status = 'ACTIVE';
    current.countdownStartedAt = null;
    current.joinDeadlineAt = null;
    current.startedAt = Date.now();

    await redis.set(`active_game:${current.player1Id}`, gameId, 'EX', 1200);
    await redis.set(`active_game:${current.player2Id}`, gameId, 'EX', 1200);
    await redis.del(
      pendingMatchKey(current.player1Id),
      pendingMatchKey(current.player2Id),
    );

    const firstQuestion = current.questions[current.questionIds[0]] ?? null;
    const firstQuestionId = current.questionIds[0];
    const servedAt = current.startedAt!;
    await Promise.all([
      incrementQuestionServeCounts(current.questionIds),
      saveGameState(current, getStateTtlSeconds(current)),
      redis.set(servedAtKey(gameId, current.player1Id, firstQuestionId), servedAt, 'EX', current.durationSeconds + 60),
      redis.set(servedAtKey(gameId, current.player2Id, firstQuestionId), servedAt, 'EX', current.durationSeconds + 60),
    ]);

    // Send start + first question in one event so mobile never has a blank ACTIVE state
    gameNs.to(gameId).emit('game:start', {
      duration: current.durationSeconds,
      totalQuestions: current.questionIds.length,
      firstQuestion: firstQuestion ? withPassage(firstQuestion, current.passages) : null,
      questionNumber: 1,
    });
    if (current.player2IsBot) {
      startBotAnswering(gameId, current.player2Id, gameNs);
    }
    logger.info({ event: 'game:start', gameId, player1Id: current.player1Id, player2Id: current.player2Id, totalQuestions: current.questionIds.length, durationSeconds: current.durationSeconds }, 'Game started');

    startGameTimer(gameId, current.durationSeconds, gameNs);
  }, COUNTDOWN_SECONDS * 1000);

  countdownTimers.set(gameId, timer);
}

function startGameTimer(
  gameId: string,
  durationSeconds: number,
  gameNs: Namespace,
): void {
  let remaining = durationSeconds;

  const interval = setInterval(() => {
    remaining -= 1;

    // Sync clients every 10s — client ticks locally between syncs
    if (remaining % 10 === 0) {
      gameNs.to(gameId).emit('game:timer', { remaining });
    }

    if (remaining <= 0) {
      clearInterval(interval);
      activeTimers.delete(gameId);
      endGame(gameId, gameNs).catch((err) => {
        Sentry.captureException(err, { extra: { gameId } });
        logger.error({ err, gameId }, 'Timer endGame error');
        gameNs.to(gameId).emit('game:error', { code: 'END_GAME_FAILED', message: 'Game failed to end' });
      });
    }
  }, 1000);

  activeTimers.set(gameId, interval);
}

async function handleAnswer(
  socket: Socket,
  userId: string,
  gameId: string,
  questionId: string,
  selectedAnswer: number | null,
  typedAnswer: string | null,
  gameNs: Namespace,
): Promise<void> {
  const state = await getGameState(gameId);
  if (!state || state.status !== 'ACTIVE') return;

  if (isAnswerLate(state.startedAt, state.durationSeconds)) return;

  const isPlayer1 = state.player1Id === userId;
  if (!isPlayer1 && state.player2Id !== userId) return;

  const progressKey = isPlayer1 ? 'player1Progress' : 'player2Progress';
  const answerKey   = isPlayer1 ? 'player1Answers'  : 'player2Answers';
  const scoreKey    = isPlayer1 ? 'player1Score'     : 'player2Score';

  const playerProgress = state[progressKey];
  const expectedQuestionId = state.questionIds[playerProgress];

  // Reject if this isn't the expected question
  if (questionId !== expectedQuestionId) return;

  // Reject if this question was already answered (double-submission guard)
  if (state[answerKey][questionId]) return;

  const expectedAnswer = state.answerKeys[questionId];
  if (!expectedAnswer) return;

  if (!isAnswerForQuestionType(expectedAnswer.questionType, { selectedAnswer, typedAnswer })) {
    logger.warn(
      { event: 'game:answer_invalid_mode', gameId, userId, questionId, questionType: expectedAnswer.questionType },
      'Rejected answer with invalid mode for question type',
    );
    return;
  }

  const isCorrect = gradeAnswer(expectedAnswer, { selectedAnswer, typedAnswer });
  logger.info({ event: 'game:answer', gameId, userId, questionId, questionNumber: playerProgress + 1, isCorrect }, 'Answer submitted');

  const servedAtRaw = await redis.get(servedAtKey(gameId, userId, questionId));
  const timeTakenMs = servedAtRaw ? Date.now() - parseInt(servedAtRaw, 10) : 0;

  state[answerKey][questionId] = {
    selected: selectedAnswer,
    typed: typedAnswer,
    correct: isCorrect,
    timeMs: timeTakenMs,
  };
  state[progressKey] += 1;
  if (isCorrect) state[scoreKey] += 1;

  // Emit to both players immediately — score is already computed in memory,
  // no need to wait for the Redis write before notifying clients
  socket.emit('answer:result', {
    questionId,
    isCorrect,
    correctAnswer: expectedAnswer.correctAnswer,
    correctAnswerText: expectedAnswer.correctAnswerText,
    yourScore: state[scoreKey],
  });

  socket.to(gameId).emit('opponent:scored', {
    opponentScore: state[scoreKey],
  });

  // Persist state and read the preloaded next question
  const newProgress = state[progressKey];
  socket.to(gameId).emit('opponent:progress', buildOpponentProgress(newProgress, state.questionIds.length));
  const changedFields: (keyof GameState)[] = [answerKey, progressKey];
  if (isCorrect) changedFields.push(scoreKey);

  const nextQuestion = newProgress < state.questionIds.length
    ? state.questions[state.questionIds[newProgress]] ?? null
    : null;
  await saveGameStateFields(state, changedFields);

  if (nextQuestion) {
    const nextQuestionId = state.questionIds[newProgress];
    await redis.set(servedAtKey(gameId, userId, nextQuestionId), Date.now(), 'EX', state.durationSeconds + 60);
    socket.emit('game:question', {
      question: withPassage(nextQuestion, state.passages),
      questionNumber: newProgress + 1,
      totalQuestions: state.questionIds.length,
    });
  }

  // End early if both players have answered every question
  if (
    state.player1Progress >= state.questionIds.length &&
    state.player2Progress >= state.questionIds.length
  ) {
    await endGame(gameId, gameNs);
  }
}

export async function endGame(
  gameId: string,
  gameNs: Namespace,
  options: { forcedWinnerId?: string } = {},
): Promise<void> {
  // NX lock prevents double-ending from concurrent timer expiry + both-players-done
  const lock = await redis.set(`game:${gameId}:ending`, '1', 'EX', 60, 'NX');
  if (!lock) return;

  const state = await getGameState(gameId);
  if (!state || state.status === 'FINISHED') return;

  state.status = 'FINISHED';
  await saveGameState(state, 300); // Keep for 5 min for reconnect grace period

  // Cancel the timer if it's still running
  const timer = activeTimers.get(gameId);
  if (timer) clearInterval(timer);
  activeTimers.delete(gameId);
  clearPreStartTimer(gameId);
  clearCountdownTimer(gameId);
  clearBotTimer(gameId);
  clearForfeitTimer(state.player1Id);
  clearForfeitTimer(state.player2Id);

  const isForfeit = options.forcedWinnerId != null;

  // Forced winner (forfeit) takes priority over score comparison
  let winnerId: string | null = options.forcedWinnerId ?? null;
  if (!winnerId) {
    if (state.player1Score > state.player2Score) winnerId = state.player1Id;
    else if (state.player2Score > state.player1Score) winnerId = state.player2Id;
  }

  // Fetch current Elo from DB — source of truth (Redis state has matchmaking-time Elo)
  const [p1, p2] = await Promise.all([
    prisma.user.findUnique({
      where: { id: state.player1Id },
      select: { eloRating: true, gamesPlayed: true, wins: true, draws: true, peakElo: true },
    }),
    prisma.user.findUnique({
      where: { id: state.player2Id },
      select: { eloRating: true, gamesPlayed: true, wins: true, draws: true, peakElo: true },
    }),
  ]);

  if (!p1 || !p2) {
    logger.error({ gameId }, 'endGame: user not found');
    return;
  }

  // For forfeit use dummy scores (1 vs 0) so the winner gets a full win Elo change
  const p1MatchScore = isForfeit ? (winnerId === state.player1Id ? 1 : 0) : state.player1Score;
  const p2MatchScore = isForfeit ? (winnerId === state.player2Id ? 1 : 0) : state.player2Score;

  const eloResult = calculateMatchElo({
    player1: { elo: p1.eloRating, gamesPlayed: p1.gamesPlayed },
    player2: { elo: p2.eloRating, gamesPlayed: p2.gamesPlayed },
    player1Score: p1MatchScore,
    player2Score: p2MatchScore,
  });
  const answers = await buildResultsAnswers(state);

  const results = {
    gameId,
    winnerId,
    isDraw: winnerId === null,
    isForfeit,
    player1: {
      userId: state.player1Id,
      score: state.player1Score,
      questionsAnswered: state.player1Progress,
      answers: state.player1Answers,
      eloBefore: p1.eloRating,
      eloAfter: eloResult.player1.newRating,
      eloDelta: eloResult.player1.delta,
      newTier: getRankTier(eloResult.player1.newRating),
      tierChanged: getRankTier(p1.eloRating) !== getRankTier(eloResult.player1.newRating),
    },
    player2: {
      userId: state.player2Id,
      score: state.player2Score,
      questionsAnswered: state.player2Progress,
      answers: state.player2Answers,
      eloBefore: p2.eloRating,
      eloAfter: eloResult.player2.newRating,
      eloDelta: eloResult.player2.delta,
      newTier: getRankTier(eloResult.player2.newRating),
      tierChanged: getRankTier(p2.eloRating) !== getRankTier(eloResult.player2.newRating),
    },
    totalQuestions: state.questionIds.length,
    durationSeconds: state.durationSeconds,
    answers,
  };

  // Persist results per player so game:join can replay them on reconnect.
  // This is the source of truth if fetchSockets() misses a socket (e.g. mobile flicker).
  await Promise.all([
    redis.set(`game:${gameId}:result:${state.player1Id}`, JSON.stringify({ ...results, currentUserId: state.player1Id }), 'EX', 300),
    redis.set(`game:${gameId}:result:${state.player2Id}`, JSON.stringify({ ...results, currentUserId: state.player2Id }), 'EX', 300),
  ]);

  // Emit to all sockets currently in the room.
  // Any socket that missed this (brief disconnect) will get it via game:join below.
  const sockets = await gameNs.in(gameId).fetchSockets();
  for (const s of sockets) {
    s.emit('game:finished', { ...results, currentUserId: s.data.user.id });
  }

  logger.info({ event: 'game:end', gameId, winnerId, isDraw: winnerId === null, isForfeit, player1Id: state.player1Id, player2Id: state.player2Id, player1Score: state.player1Score, player2Score: state.player2Score, player1EloDelta: eloResult.player1.delta, player2EloDelta: eloResult.player2.delta }, 'Game ended');

  // Clean up active game markers
  await redis.del(
    `active_game:${state.player1Id}`,
    `active_game:${state.player2Id}`,
  );

  persistMatch(
    state,
    winnerId,
    isForfeit,
    eloResult,
    { player1: p1, player2: p2 },
  ).catch((err) => {
    Sentry.captureException(err, { extra: { gameId } });
    logger.error({ err, gameId }, 'persistMatch error');
    gameNs.in(gameId).emit('game:error', { code: 'PERSIST_FAILED', message: 'Match result could not be saved' });
  });
}

async function persistMatch(
  state: GameState,
  winnerId: string | null,
  isForfeit: boolean,
  eloResult: MatchEloResult,
  userStats: { player1: MatchPersistUserStats; player2: MatchPersistUserStats },
): Promise<void> {
  const answerRows: {
    matchId: string;
    userId: string;
    questionId: string;
    selectedAnswer: number | null;
    typedAnswer: string | null;
    isCorrect: boolean;
    timeTakenMs: number;
  }[] = [];

  for (const [questionId, record] of Object.entries(state.player1Answers)) {
    answerRows.push({
      matchId: state.gameId,
      userId: state.player1Id,
      questionId,
      selectedAnswer: record.selected,
      typedAnswer: record.typed,
      isCorrect: record.correct,
      timeTakenMs: record.timeMs,
    });
  }
  for (const [questionId, record] of Object.entries(state.player2Answers)) {
    answerRows.push({
      matchId: state.gameId,
      userId: state.player2Id,
      questionId,
      selectedAnswer: record.selected,
      typedAnswer: record.typed,
      isCorrect: record.correct,
      timeTakenMs: record.timeMs,
    });
  }

  try {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.match.create({
            data: {
              id: state.gameId,
              player1Id: state.player1Id,
              player2Id: state.player2Id,
              winnerId,
              isDraw: winnerId === null,
              player1Score: state.player1Score,
              player2Score: state.player2Score,
              player1EloChange: eloResult.player1.delta,
              player2EloChange: eloResult.player2.delta,
              player1EloAfter: eloResult.player1.newRating,
              player2EloAfter: eloResult.player2.newRating,
              player1Answered: state.player1Progress,
              player2Answered: state.player2Progress,
              totalQuestions: state.questionIds.length,
              durationSeconds: state.durationSeconds,
              status: isForfeit ? 'forfeited' : 'completed',
              finishedAt: new Date(),
            },
          });

          await tx.matchAnswer.createMany({ data: answerRows });

          const player1GamesPlayed = userStats.player1.gamesPlayed + 1;
          const player1Wins = userStats.player1.wins + (winnerId === state.player1Id ? 1 : 0);
          const player1Draws = userStats.player1.draws + (winnerId === null ? 1 : 0);
          const player2GamesPlayed = userStats.player2.gamesPlayed + 1;
          const player2Wins = userStats.player2.wins + (winnerId === state.player2Id ? 1 : 0);
          const player2Draws = userStats.player2.draws + (winnerId === null ? 1 : 0);

          await tx.user.update({
            where: { id: state.player1Id },
            data: {
              eloRating: eloResult.player1.newRating,
              peakElo: Math.max(userStats.player1.peakElo, eloResult.player1.newRating),
              rankTier: getRankTier(eloResult.player1.newRating),
              gamesPlayed: { increment: 1 },
              wins: player1Wins,
              draws: player1Draws,
              winRate: player1Wins / player1GamesPlayed,
            },
          });
          await tx.user.update({
            where: { id: state.player2Id },
            data: {
              eloRating: eloResult.player2.newRating,
              peakElo: Math.max(userStats.player2.peakElo, eloResult.player2.newRating),
              rankTier: getRankTier(eloResult.player2.newRating),
              gamesPlayed: { increment: 1 },
              wins: player2Wins,
              draws: player2Draws,
              winRate: player2Wins / player2GamesPlayed,
            },
          });
        });

        await Promise.all([
          invalidateUserById(state.player1Id),
          invalidateUserById(state.player2Id),
          invalidateUserGlobalRank(state.player1Id),
          invalidateUserGlobalRank(state.player2Id),
        ]);

        return;
      } catch (err) {
        logger.error({ err, gameId: state.gameId, attempt, maxRetries: MAX_RETRIES }, 'persistMatch attempt failed');
        if (attempt === MAX_RETRIES) {
          await redis.lpush(
            'match_persist_failed',
            JSON.stringify({ gameId: state.gameId, failedAt: Date.now() }),
          );
          throw err;
        }
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
      }
    }
  } finally {
    if (state.player2IsBot) {
      await redis.del(botBusyKey(state.player2Id));
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function initializeGame(
  gameId: string,
  player1: GamePlayer,
  player2: GamePlayer,
  options: {
    player1Profile: GamePlayerProfile;
    player2Profile: GamePlayerProfile;
    player1RatingImpact: RatingImpact;
    player2RatingImpact: RatingImpact;
    player1IsBot?: boolean;
    player2IsBot?: boolean;
    gameNs: Namespace;
  },
): Promise<void> {
  const { questionIds, questions, answerKeys, passages } = await selectQuestionsForMatch(player1.elo, player2.elo);
  const joinDeadlineAt = Date.now() + PRESTART_TIMEOUT_MS;

  const state: GameState = {
    gameId,
    status: 'FOUND',
    player1Id: player1.userId,
    player2Id: player2.userId,
    player1IsBot: options.player1IsBot ?? false,
    player2IsBot: options.player2IsBot ?? false,
    player1Profile: options.player1Profile,
    player2Profile: options.player2Profile,
    player1RatingImpact: options.player1RatingImpact,
    player2RatingImpact: options.player2RatingImpact,
    questionIds,
    questions,
    answerKeys,
    passages,
    player1Progress: 0,
    player2Progress: 0,
    player1Score: 0,
    player2Score: 0,
    player1Joined: false,
    player2Joined: false,
    player1Answers: {},
    player2Answers: {},
    durationSeconds: GAME_DURATION_SECONDS,
    joinDeadlineAt,
    countdownStartedAt: null,
    startedAt: null,
    createdAt: Date.now(),
  };

  await saveGameState(state, getStateTtlSeconds(state));
  await redis.set(pendingMatchKey(player1.userId), gameId, 'EX', PRESTART_TTL_SECONDS);
  await redis.set(pendingMatchKey(player2.userId), gameId, 'EX', PRESTART_TTL_SECONDS);
  await schedulePreStartTimeout(gameId, joinDeadlineAt, options.gameNs);
}

export function registerGameHandlers(gameNs: Namespace): void {
  gameNs.on('connection', (socket) => {
    const user = socket.data.user;
    void redis.set(socketKey(user.id), socket.id, 'EX', 1200).catch((err) =>
      logger.error({ err, userId: user.id }, 'Socket bind error'),
    );

    socket.on('game:join', withSentry(async (payload: unknown) => {
      if (!(await enforceSocketEventLimit(socket, 'game:join', user.id))) return;

      const parsedPayload = parseSocketPayload(socket, 'game:join', socketGameIdPayloadSchema, payload);
      if (!parsedPayload) return;
      const { gameId } = parsedPayload;

      const state = await getGameState(gameId);
      if (!state) return socket.emit('game:error', { message: 'Game not found' });

      const isPlayer1User = state.player1Id === user.id;
      const isPlayer2User = state.player2Id === user.id;
      if (!isPlayer1User && !isPlayer2User) {
        return socket.emit('game:error', { message: 'Not your game' });
      }

      // Cancel any pending auto-forfeit timer (player reconnected in time)
      const hadForfeitTimer = forfeitTimers.has(user.id);
      clearForfeitTimer(user.id);

      socket.join(gameId);
      void redis.set(socketKey(user.id), socket.id, 'EX', 1200).catch(() => {});

      if (state.status === 'FINISHED') {
        const raw = await redis.get(`game:${gameId}:result:${user.id}`);
        if (raw) {
          socket.emit('game:finished', JSON.parse(raw));
        }
        return;
      }

      if (state.status === 'CANCELLED') {
        socket.emit('match:cancelled', { gameId, reason: 'cancelled' });
        return;
      }

      if (state.status === 'ACTIVE') {
        if (hadForfeitTimer) {
          const opponentId = isPlayer1User ? state.player2Id : state.player1Id;
          await emitToUser(gameNs, opponentId, 'opponent:reconnected', { gameId });
        }

        // Reconnection: send full current state so client can resume
        const playerProgress = isPlayer1User ? state.player1Progress : state.player2Progress;
        const opponentAnswered = isPlayer1User ? state.player2Progress : state.player1Progress;
        const questionIndex = Math.min(playerProgress, state.questionIds.length - 1);
        const currentQuestion = state.questions[state.questionIds[questionIndex]] ?? null;
        const elapsed = Math.floor(
          (Date.now() - (state.startedAt ?? Date.now())) / 1000,
        );

        socket.emit('game:sync', {
          yourScore: isPlayer1User ? state.player1Score : state.player2Score,
          opponentScore: isPlayer1User ? state.player2Score : state.player1Score,
          timeRemaining: Math.max(0, state.durationSeconds - elapsed),
          currentQuestion: currentQuestion ? withPassage(currentQuestion, state.passages) : null,
          questionNumber: Math.min(playerProgress + 1, state.questionIds.length),
          totalQuestions: state.questionIds.length,
          opponentProgress: buildOpponentProgress(opponentAnswered, state.questionIds.length),
        });
        return;
      }

      if (state.status === 'COUNTDOWN') {
        const elapsedCountdown = Math.floor(
          (Date.now() - (state.countdownStartedAt ?? Date.now())) / 1000,
        );
        const remaining = Math.max(0, COUNTDOWN_SECONDS - elapsedCountdown);
        socket.emit('match:status', {
          gameId,
          status: 'countdown',
          seconds: remaining,
        });
        return;
      }

      if (state.status === 'FOUND' || state.status === 'WAITING_FOR_PLAYERS') {
        const readiness = await markPreStartPlayerJoined(state, user.id);
        if (!readiness || readiness.status !== 'WAITING_FOR_PLAYERS') return;

        if (!readiness.player1Joined || !readiness.player2Joined) {
          socket.emit('match:status', {
            gameId,
            status: 'waiting_for_opponent',
          });
          return;
        }

        // NX lock prevents double-countdown when both sockets join concurrently
        const lock = await redis.set(
          `game:${gameId}:starting`,
          '1',
          'EX',
          30,
          'NX',
        );
        if (lock) {
          const latestState = await getGameState(gameId);
          if (
            latestState &&
            latestState.status === 'WAITING_FOR_PLAYERS' &&
            bothPlayersJoined(latestState)
          ) {
            await startCountdown(gameId, latestState, gameNs);
          }
        }
      }
    }));

    socket.on(
      'answer:submit',
      async (payload: unknown) => {
        let gameId: string | undefined;
        try {
          if (!(await enforceSocketEventLimit(socket, 'answer:submit', user.id))) return;

          const parsedPayload = parseSocketPayload(socket, 'answer:submit', socketAnswerSubmitPayloadSchema, payload);
          if (!parsedPayload) return;
          gameId = parsedPayload.gameId;

          await handleAnswer(
            socket,
            user.id,
            parsedPayload.gameId,
            parsedPayload.questionId,
            parsedPayload.selectedAnswer ?? null,
            parsedPayload.typedAnswer ?? null,
            gameNs,
          );
        } catch (err) {
          Sentry.captureException(err, { extra: { gameId, userId: user.id } });
          logger.error({ err, gameId }, 'Answer handling error');
        }
      },
    );

    socket.on('game:forfeit', withSentry(async (payload: unknown) => {
      const parsedPayload = parseSocketPayload(socket, 'game:forfeit', socketGameIdPayloadSchema, payload);
      if (!parsedPayload) return;
      const { gameId } = parsedPayload;

      const state = await getGameState(gameId);
      if (!state || state.status !== 'ACTIVE') return;

      if (state.player1Id !== user.id && state.player2Id !== user.id) return;

      const opponentId =
        state.player1Id === user.id ? state.player2Id : state.player1Id;

      await endGame(gameId, gameNs, { forcedWinnerId: opponentId }).catch((err) => {
        Sentry.captureException(err, { extra: { gameId, userId: user.id } });
        logger.error({ err, gameId }, 'Forfeit endGame error');
        gameNs.to(gameId).emit('game:error', { code: 'END_GAME_FAILED', message: 'Game failed to end' });
      });
    }));

    socket.on('game:cancel_prestart', withSentry(async (payload: unknown) => {
      const parsedPayload = parseSocketPayload(socket, 'game:cancel_prestart', socketGameIdPayloadSchema, payload);
      if (!parsedPayload) return;
      const { gameId } = parsedPayload;

      const state = await getGameState(gameId);
      if (!state || !isPreStartStatus(state.status) || !isParticipant(state, user.id)) return;

      await cancelPreStartGame(gameId, gameNs, 'opponent_left', user.id);
    }));

    socket.on('disconnect', withSentry(async () => {
      const currentSocketId = await redis.get(socketKey(user.id));
      if (currentSocketId === socket.id) {
        await redis.del(socketKey(user.id));
      }

      const pendingGameId = await getPendingGameId(user.id);
      if (pendingGameId) {
        const pendingState = await getGameState(pendingGameId);
        if (pendingState && isPreStartStatus(pendingState.status) && isParticipant(pendingState, user.id)) {
          setJoined(pendingState, user.id, false);

          if (pendingState.status === 'COUNTDOWN') {
            await saveGameState(pendingState, getStateTtlSeconds(pendingState));
            await cancelPreStartGame(pendingGameId, gameNs, 'opponent_left');
            return;
          }

          pendingState.status = bothPlayersJoined(pendingState) ? 'WAITING_FOR_PLAYERS' : 'FOUND';
          await saveGameState(pendingState, getStateTtlSeconds(pendingState));
        }
      }

      const gameId = await getActiveGameId(user.id);
      if (!gameId) return;

      const state = await getGameState(gameId);
      if (!state || state.status !== 'ACTIVE') return;

      if (forfeitTimers.has(user.id)) return;

      const opponentId =
        state.player1Id === user.id ? state.player2Id : state.player1Id;

      await emitToUser(gameNs, opponentId, 'opponent:disconnected', {
        gameId,
        secondsUntilForfeit: ACTIVE_FORFEIT_GRACE_SECONDS,
      });

      // Start a short active-duel auto-forfeit timer. Cancelled if the player reconnects.
      const timer = setTimeout(async () => {
        forfeitTimers.delete(user.id);
        const current = await getGameState(gameId);
        if (!current || current.status !== 'ACTIVE') return;

        const currentOpponentId =
          current.player1Id === user.id ? current.player2Id : current.player1Id;

        await endGame(gameId, gameNs, { forcedWinnerId: currentOpponentId }).catch((err) => {
          Sentry.captureException(err, { extra: { gameId } });
          logger.error({ err, gameId }, 'Auto-forfeit endGame error');
          gameNs.to(gameId).emit('game:error', { code: 'END_GAME_FAILED', message: 'Game failed to end' });
        });
      }, ACTIVE_FORFEIT_GRACE_SECONDS * 1000);

      forfeitTimers.set(user.id, timer);
    }));
  });
}

export async function getActiveGameId(userId: string): Promise<string | null> {
  return redis.get(`active_game:${userId}`);
}

export async function getActiveGameForUser(userId: string): Promise<{
  gameId: string;
  opponent: GamePlayerProfile;
  initialState: {
    duration: number;
    totalQuestions: number;
    firstQuestion: ClientQuestion & { passage: ClientPassage | null };
    questionNumber: number;
  };
} | null> {
  const gameId = await getActiveGameId(userId);
  if (!gameId) return null;

  const state = await getGameState(gameId);
  if (!state || !isParticipant(state, userId) || state.status !== 'ACTIVE') {
    await redis.del(`active_game:${userId}`);
    return null;
  }

  const isPlayer1User = isPlayer1(state, userId);
  const playerProgress = isPlayer1User ? state.player1Progress : state.player2Progress;
  const questionIndex = Math.min(playerProgress, state.questionIds.length - 1);
  const firstQuestion = state.questions[state.questionIds[questionIndex]] ?? null;
  if (!firstQuestion) {
    await redis.del(`active_game:${userId}`);
    return null;
  }

  const elapsed = Math.floor((Date.now() - (state.startedAt ?? Date.now())) / 1000);

  return {
    gameId,
    opponent: isPlayer1User ? state.player2Profile : state.player1Profile,
    initialState: {
      duration: Math.max(0, state.durationSeconds - elapsed),
      totalQuestions: state.questionIds.length,
      firstQuestion: withPassage(firstQuestion, state.passages),
      questionNumber: Math.min(playerProgress + 1, state.questionIds.length),
    },
  };
}

export async function getPendingMatchForUser(
  userId: string,
): Promise<PendingMatchPayload | null> {
  const gameId = await getPendingGameId(userId);
  if (!gameId) return null;

  const state = await getGameState(gameId);
  if (!state || !isParticipant(state, userId) || !isPreStartStatus(state.status)) {
    await redis.del(pendingMatchKey(userId));
    return null;
  }

  return buildPendingMatchPayload(state, userId);
}

export async function getPendingGameId(userId: string): Promise<string | null> {
  return redis.get(pendingMatchKey(userId));
}

export async function recoverActiveGames(gameNs: Namespace): Promise<void> {
  const gameIds = new Set<string>();

  for (const pattern of ['active_game:*', 'pending_match:*']) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        const gameId = await redis.get(key);
        if (gameId) gameIds.add(gameId);
      }
    } while (cursor !== '0');
  }

  const now = Date.now();
  for (const gameId of gameIds) {
    try {
      const state = await getGameState(gameId);
      if (!state) continue;

      if (state.status === 'COUNTDOWN') {
        const elapsed = now - (state.countdownStartedAt ?? now);
        if (elapsed > 30_000) {
          await redis.del(
            pendingMatchKey(state.player1Id),
            pendingMatchKey(state.player2Id),
            gameStateKey(gameId),
          );
        }
        continue;
      }

      if (state.status !== 'ACTIVE' || !state.startedAt) continue;

      const endTime = state.startedAt + state.durationSeconds * 1000;
      if (now >= endTime) {
        await endGame(gameId, gameNs);
      } else {
        const remainingSeconds = Math.ceil((endTime - now) / 1000);
        startGameTimer(gameId, remainingSeconds, gameNs);
        if (state.player2IsBot) {
          startBotAnswering(gameId, state.player2Id, gameNs);
        }
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { gameId } });
      logger.error({ err, gameId }, 'recoverActiveGames: game recovery failed');
    }
  }
}
