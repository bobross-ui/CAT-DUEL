import { Namespace, Socket } from 'socket.io';
import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import { calculateMatchElo, getRankTier, MatchEloResult } from './elo';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerAnswerRecord {
  selected: number;
  correct: boolean;
  timeMs: number;
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
}

interface GameState {
  gameId: string;
  status: 'FOUND' | 'WAITING_FOR_PLAYERS' | 'COUNTDOWN' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
  player1Id: string;
  player2Id: string;
  player1Profile: GamePlayerProfile;
  player2Profile: GamePlayerProfile;
  player1RatingImpact: RatingImpact;
  player2RatingImpact: RatingImpact;
  questionIds: string[];
  correctAnswers: Record<string, number>; // server-only, never sent to clients
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

function buildOpponentProgress(answered: number, totalQuestions: number) {
  if (answered <= 0) return null;

  return {
    currentQuestion: Math.min(answered + 1, totalQuestions),
    questionsAnswered: answered,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTION_COUNT = 20;
const GAME_DURATION_SECONDS = 120; // TODO: restore to 600 after testing
const COUNTDOWN_SECONDS = 3;
const PRESTART_TIMEOUT_MS = 10_000;
const PRESTART_TTL_SECONDS = 30;
const ACTIVE_FORFEIT_GRACE_SECONDS = 15;

// In-memory timer maps. Both are lost on server restart; active games in Redis
// would need their timers re-initialized by scanning active_game:* keys on startup
// (deferred to a future hardening pass).
const activeTimers = new Map<string, NodeJS.Timeout>();
const forfeitTimers = new Map<string, NodeJS.Timeout>(); // keyed by userId
const preStartTimers = new Map<string, NodeJS.Timeout>();
const countdownTimers = new Map<string, NodeJS.Timeout>();

// ─── Redis helpers ─────────────────────────────────────────────────────────────

async function getGameState(gameId: string): Promise<GameState | null> {
  const raw = await redis.get(`game:${gameId}`);
  return raw ? (JSON.parse(raw) as GameState) : null;
}

async function saveGameState(state: GameState, ttlSeconds = 1200): Promise<void> {
  await redis.set(`game:${state.gameId}`, JSON.stringify(state), 'EX', ttlSeconds);
}

function socketKey(userId: string) {
  return `socket:game:${userId}`;
}

function pendingMatchKey(userId: string) {
  return `pending_match:${userId}`;
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
): Promise<void> {
  const lock = await redis.set(`game:${gameId}:cancelling`, '1', 'EX', 30, 'NX');
  if (!lock) return;

  const state = await getGameState(gameId);
  if (!state || !isPreStartStatus(state.status)) return;

  await emitToParticipants(gameNs, state, 'match:cancelled', { gameId, reason });

  const requeueTargets = [
    state.player1Joined ? state.player1Id : null,
    state.player2Joined ? state.player2Id : null,
  ].filter((value): value is string => value != null);

  await Promise.all(
    requeueTargets.map((userId) =>
      emitToUser(gameNs, userId, 'match:requeueing', { gameId, reason }),
    ),
  );

  await clearPreStartState(state);
}

async function schedulePreStartTimeout(
  gameId: string,
  joinDeadlineAt: number,
  gameNs: Namespace,
): Promise<void> {
  clearPreStartTimer(gameId);
  const delay = Math.max(joinDeadlineAt - Date.now(), 0);
  const timer = setTimeout(() => {
    cancelPreStartGame(gameId, gameNs, 'join_timeout').catch((err) =>
      console.error(`Pre-start timeout error [${gameId}]:`, err),
    );
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

  const result: T[] = [];
  const categories = Object.keys(groups);
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
): Promise<{ questionIds: string[]; correctAnswers: Record<string, number> }> {
  const avgElo = (p1Elo + p2Elo) / 2;

  let minDiff: number, maxDiff: number;
  if (avgElo < 1000)      { minDiff = 1; maxDiff = 2; }
  else if (avgElo < 1300) { minDiff = 2; maxDiff = 3; }
  else if (avgElo < 1600) { minDiff = 3; maxDiff = 4; }
  else                    { minDiff = 4; maxDiff = 5; }

  const questions = await prisma.question.findMany({
    where: {
      isVerified: true,
      difficulty: { gte: minDiff, lte: maxDiff },
    },
    select: { id: true, category: true, correctAnswer: true },
    orderBy: { timesServed: 'asc' },
    take: 60,
  });

  const balanced = balanceByCategory(questions, QUESTION_COUNT);
  const shuffled = shuffle(balanced);

  const questionIds = shuffled.map((q) => q.id);
  const correctAnswers: Record<string, number> = {};
  for (const q of shuffled) correctAnswers[q.id] = q.correctAnswer;

  return { questionIds, correctAnswers };
}

// ─── Client-safe question (no correctAnswer or explanation) ───────────────────

async function getQuestionForClient(questionId: string) {
  return prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      category: true,
      subTopic: true,
      difficulty: true,
      text: true,
      options: true,
      // correctAnswer intentionally excluded — never sent before submission
      // explanation intentionally excluded — shown in results screen only
    },
  });
}

// ─── Game lifecycle ────────────────────────────────────────────────────────────

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

    const [firstQuestion] = await Promise.all([
      getQuestionForClient(current.questionIds[0]),
      saveGameState(current, getStateTtlSeconds(current)),
    ]);

    // Send start + first question in one event so mobile never has a blank ACTIVE state
    gameNs.to(gameId).emit('game:start', {
      duration: current.durationSeconds,
      totalQuestions: current.questionIds.length,
      firstQuestion,
      questionNumber: 1,
    });

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
      endGame(gameId, gameNs).catch((err) =>
        console.error(`Timer endGame error [${gameId}]:`, err),
      );
    }
  }, 1000);

  activeTimers.set(gameId, interval);
}

async function handleAnswer(
  socket: Socket,
  userId: string,
  gameId: string,
  questionId: string,
  selectedAnswer: number,
  timeTakenMs: number,
  gameNs: Namespace,
): Promise<void> {
  const state = await getGameState(gameId);
  if (!state || state.status !== 'ACTIVE') return;

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

  const correctAnswer = state.correctAnswers[questionId];
  if (correctAnswer === undefined) return;

  const isCorrect = correctAnswer === selectedAnswer;

  state[answerKey][questionId] = {
    selected: selectedAnswer,
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
    correctAnswer,
    yourScore: state[scoreKey],
  });

  socket.to(gameId).emit('opponent:scored', {
    opponentScore: state[scoreKey],
  });

  // Persist state and fetch next question in parallel
  const newProgress = state[progressKey];
  socket.to(gameId).emit('opponent:progress', buildOpponentProgress(newProgress, state.questionIds.length));
  const [nextQuestion] = await Promise.all([
    newProgress < state.questionIds.length
      ? getQuestionForClient(state.questionIds[newProgress])
      : Promise.resolve(null),
    saveGameState(state),
  ]);

  if (nextQuestion) {
    socket.emit('game:question', {
      question: nextQuestion,
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
      select: { eloRating: true, gamesPlayed: true },
    }),
    prisma.user.findUnique({
      where: { id: state.player2Id },
      select: { eloRating: true, gamesPlayed: true },
    }),
  ]);

  if (!p1 || !p2) {
    console.error(`[endGame] user not found for game ${gameId}`);
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

  // Clean up active game markers
  await redis.del(
    `active_game:${state.player1Id}`,
    `active_game:${state.player2Id}`,
  );

  persistMatch(state, winnerId, isForfeit, eloResult).catch((err) =>
    console.error(`persistMatch error [${gameId}]:`, err),
  );
}

async function persistMatch(
  state: GameState,
  winnerId: string | null,
  isForfeit: boolean,
  eloResult: MatchEloResult,
): Promise<void> {
  const answerRows: {
    matchId: string;
    userId: string;
    questionId: string;
    selectedAnswer: number;
    isCorrect: boolean;
    timeTakenMs: number;
  }[] = [];

  for (const [questionId, record] of Object.entries(state.player1Answers)) {
    answerRows.push({
      matchId: state.gameId,
      userId: state.player1Id,
      questionId,
      selectedAnswer: record.selected,
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
      isCorrect: record.correct,
      timeTakenMs: record.timeMs,
    });
  }

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
            player1Answered: state.player1Progress,
            player2Answered: state.player2Progress,
            totalQuestions: state.questionIds.length,
            durationSeconds: state.durationSeconds,
            status: isForfeit ? 'forfeited' : 'completed',
            finishedAt: new Date(),
          },
        });

        await tx.matchAnswer.createMany({ data: answerRows });

        await tx.user.update({
          where: { id: state.player1Id },
          data: {
            eloRating: eloResult.player1.newRating,
            rankTier: getRankTier(eloResult.player1.newRating),
            gamesPlayed: { increment: 1 },
          },
        });
        await tx.user.update({
          where: { id: state.player2Id },
          data: {
            eloRating: eloResult.player2.newRating,
            rankTier: getRankTier(eloResult.player2.newRating),
            gamesPlayed: { increment: 1 },
          },
        });
      });

      return;
    } catch (err) {
      console.error(`[persistMatch] attempt ${attempt}/${MAX_RETRIES} failed:`, err);
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
    gameNs: Namespace;
  },
): Promise<void> {
  const { questionIds, correctAnswers } = await selectQuestionsForMatch(player1.elo, player2.elo);
  const joinDeadlineAt = Date.now() + PRESTART_TIMEOUT_MS;

  const state: GameState = {
    gameId,
    status: 'FOUND',
    player1Id: player1.userId,
    player2Id: player2.userId,
    player1Profile: options.player1Profile,
    player2Profile: options.player2Profile,
    player1RatingImpact: options.player1RatingImpact,
    player2RatingImpact: options.player2RatingImpact,
    questionIds,
    correctAnswers,
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
      console.error(`Socket bind error [${user.id}]:`, err),
    );

    socket.on('game:join', async ({ gameId }: { gameId: string }) => {
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
        const currentQuestion = await getQuestionForClient(
          state.questionIds[questionIndex],
        );
        const elapsed = Math.floor(
          (Date.now() - (state.startedAt ?? Date.now())) / 1000,
        );

        socket.emit('game:sync', {
          yourScore: isPlayer1User ? state.player1Score : state.player2Score,
          opponentScore: isPlayer1User ? state.player2Score : state.player1Score,
          timeRemaining: Math.max(0, state.durationSeconds - elapsed),
          currentQuestion,
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
        setJoined(state, user.id, true);
        state.status = 'WAITING_FOR_PLAYERS';
        await saveGameState(state, getStateTtlSeconds(state));

        if (!bothPlayersJoined(state)) {
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
        if (lock) await startCountdown(gameId, state, gameNs);
      }
    });

    socket.on(
      'answer:submit',
      ({
        gameId,
        questionId,
        selectedAnswer,
        timeTakenMs,
      }: {
        gameId: string;
        questionId: string;
        selectedAnswer: number;
        timeTakenMs: number;
      }) => {
        handleAnswer(
          socket,
          user.id,
          gameId,
          questionId,
          selectedAnswer,
          timeTakenMs,
          gameNs,
        ).catch((err) =>
          console.error(`Answer handling error [${gameId}]:`, err),
        );
      },
    );

    socket.on('game:forfeit', async ({ gameId }: { gameId: string }) => {
      const state = await getGameState(gameId);
      if (!state || state.status !== 'ACTIVE') return;

      if (state.player1Id !== user.id && state.player2Id !== user.id) return;

      const opponentId =
        state.player1Id === user.id ? state.player2Id : state.player1Id;

      await endGame(gameId, gameNs, { forcedWinnerId: opponentId }).catch((err) =>
        console.error(`Forfeit endGame error [${gameId}]:`, err),
      );
    });

    socket.on('disconnect', async () => {
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

        await endGame(gameId, gameNs, { forcedWinnerId: currentOpponentId }).catch((err) =>
          console.error(`Auto-forfeit endGame error [${gameId}]:`, err),
        );
      }, ACTIVE_FORFEIT_GRACE_SECONDS * 1000);

      forfeitTimers.set(user.id, timer);
    });
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
    firstQuestion: Awaited<ReturnType<typeof getQuestionForClient>>;
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
  const firstQuestion = await getQuestionForClient(state.questionIds[questionIndex]);
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
      firstQuestion,
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
