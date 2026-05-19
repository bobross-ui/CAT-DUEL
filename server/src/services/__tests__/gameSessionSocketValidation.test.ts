import type { Namespace, Socket } from 'socket.io';
import { redis } from '../../config/redis';
import { registerGameHandlers } from '../gameSession';
import { enforceSocketEventLimit } from '../socketRateLimit';

jest.mock('../../config/redis', () => ({
  redis: {
    del: jest.fn(),
    get: jest.fn(),
    hgetall: jest.fn(),
    hmget: jest.fn(),
    multi: jest.fn(() => ({
      del: jest.fn().mockReturnThis(),
      exec: jest.fn(),
      expire: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    })),
    pipeline: jest.fn(() => ({
      exec: jest.fn(),
      set: jest.fn().mockReturnThis(),
    })),
    set: jest.fn().mockResolvedValue('OK'),
    type: jest.fn(),
  },
}));

jest.mock('../../models/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    match: { create: jest.fn() },
    matchAnswer: { createMany: jest.fn() },
    question: { findMany: jest.fn() },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../socketRateLimit', () => ({
  enforceSocketEventLimit: jest.fn(),
}));

type SocketHandler = (payload?: unknown) => Promise<void> | void;

const gameId = '00000000-0000-4000-8000-000000000001';
const questionId = '00000000-0000-4000-8000-000000000002';

function serializeState(state: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(state).map(([key, value]) => [key, JSON.stringify(value)]),
  );
}

function createMultiFromMock() {
  return {
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
    expire: jest.fn().mockReturnThis(),
    hset: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
}

function activeGameState(overrides: Record<string, unknown> = {}) {
  return {
    gameId,
    status: 'ACTIVE',
    player1Id: 'user-1',
    player2Id: 'user-2',
    player1IsBot: false,
    player2IsBot: false,
    player1Profile: { userId: 'user-1', displayName: null, avatarUrl: null, eloRating: 1200, gamesPlayed: 0, winRate: 0 },
    player2Profile: { userId: 'user-2', displayName: null, avatarUrl: null, eloRating: 1200, gamesPlayed: 0, winRate: 0 },
    player1RatingImpact: { win: 10, loss: -10 },
    player2RatingImpact: { win: 10, loss: -10 },
    questionIds: [questionId],
    questions: {
      [questionId]: {
        id: questionId,
        category: 'QUANT',
        questionType: 'TITA',
        subTopic: null,
        subType: null,
        difficulty: 1,
        text: 'What is 40 + 2?',
        options: null,
        passageId: null,
      },
    },
    answerKeys: {
      [questionId]: {
        questionType: 'TITA',
        correctAnswer: null,
        correctAnswerText: '42',
      },
    },
    passages: {},
    player1Queue: [questionId],
    player2Queue: [questionId],
    player1SeenIds: [questionId],
    player2SeenIds: [questionId],
    player1SkippedIds: [],
    player2SkippedIds: [],
    player1Progress: 0,
    player2Progress: 0,
    player1Score: 0,
    player2Score: 0,
    player1Joined: true,
    player2Joined: true,
    player1Answers: {},
    player2Answers: {},
    durationSeconds: 600,
    joinDeadlineAt: null,
    countdownStartedAt: null,
    startedAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

function createHarness() {
  const namespaceHandlers = new Map<string, (socket: Socket) => void>();
  const socketHandlers = new Map<string, SocketHandler>();

  const gameNs = {
    on: jest.fn((event: string, handler: (socket: Socket) => void) => {
      namespaceHandlers.set(event, handler);
    }),
    in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([]) })),
    to: jest.fn(() => ({ emit: jest.fn() })),
  } as unknown as Namespace;

  const socket = {
    data: { user: { id: 'user-1' } },
    emit: jest.fn(),
    id: 'socket-1',
    join: jest.fn(),
    nsp: { name: '/game' },
    on: jest.fn((event: string, handler: SocketHandler) => {
      socketHandlers.set(event, handler);
    }),
    to: jest.fn(() => ({ emit: jest.fn() })),
  } as unknown as Socket;

  registerGameHandlers(gameNs);
  namespaceHandlers.get('connection')?.(socket);

  return { socket, socketHandlers };
}

describe('game socket payload validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (enforceSocketEventLimit as jest.Mock).mockResolvedValue(true);
    (redis.set as jest.Mock).mockResolvedValue('OK');
  });

  it('emits validation errors for malformed answer submissions before reading game state', async () => {
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('answer:submit')?.({
      gameId,
      questionId,
      typedAnswer: 'x'.repeat(129),
    });

    expect(enforceSocketEventLimit).toHaveBeenCalledWith(socket, 'answer:submit', 'user-1');
    expect(socket.emit).toHaveBeenCalledWith('game:error', expect.objectContaining({
      code: 'VALIDATION_ERROR',
    }));
    expect(redis.type).not.toHaveBeenCalled();
  });

  it('validates game-id-only events before reading game state', async () => {
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('game:join')?.({ gameId: 'not-a-uuid' });

    expect(enforceSocketEventLimit).toHaveBeenCalledWith(socket, 'game:join', 'user-1');
    expect(socket.emit).toHaveBeenCalledWith('game:error', expect.objectContaining({
      code: 'VALIDATION_ERROR',
    }));
    expect(redis.type).not.toHaveBeenCalled();
  });

  it('includes the opponent profile when syncing an active game', async () => {
    const botProfile = {
      userId: 'user-2',
      displayName: 'Atharv Khurana',
      avatarUrl: null,
      eloRating: 1210,
      gamesPlayed: 30,
      winRate: 0.53,
    };
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState({
      player2IsBot: true,
      player2Profile: botProfile,
    })));
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('game:join')?.({ gameId });

    expect(socket.emit).toHaveBeenCalledWith('game:sync', expect.objectContaining({
      opponent: botProfile,
      yourSeenIds: [questionId],
    }));
  });

  it('syncs queue-head current question plus seen and skipped ids on reconnect', async () => {
    const q2 = '00000000-0000-4000-8000-000000000003';
    const q3 = '00000000-0000-4000-8000-000000000004';
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState({
      questionIds: [questionId, q2, q3],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q1', options: null, passageId: null },
        [q2]: { id: q2, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
        [q3]: { id: q3, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q3', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [q2]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
        [q3]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '44' },
      },
      player1Queue: [q3, questionId],
      player1SeenIds: [questionId, q2, q3],
      player1SkippedIds: [questionId],
      player1Answers: { [q2]: { selected: null, typed: '43', correct: true, timeMs: 1000 } },
      player1Progress: 1,
    })));
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('game:join')?.({ gameId });

    expect(socket.emit).toHaveBeenCalledWith('game:sync', expect.objectContaining({
      currentQuestion: expect.objectContaining({ id: q3 }),
      currentQuestionId: q3,
      questionNumber: 3,
      questionIds: [questionId, q2, q3],
      yourSeenIds: [questionId, q2, q3],
      yourSkippedIds: [questionId],
    }));
  });

  it('shifts the human player queue and emits the next question on answer:submit', async () => {
    const secondQuestionId = '00000000-0000-4000-8000-000000000003';
    const multi = createMultiFromMock();
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState({
      questionIds: [questionId, secondQuestionId],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'What is 40 + 2?', options: null, passageId: null },
        [secondQuestionId]: { id: secondQuestionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'What is 40 + 3?', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [secondQuestionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
      },
      player1Queue: [questionId, secondQuestionId],
      player2Queue: [questionId, secondQuestionId],
      player1SeenIds: [questionId],
      player2SeenIds: [questionId],
    })));
    (redis.multi as jest.Mock).mockReturnValueOnce(multi);
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('answer:submit')?.({
      gameId,
      questionId,
      typedAnswer: '42',
    });

    expect(multi.hset).toHaveBeenCalledWith(`game:${gameId}`, expect.objectContaining({
      player1Queue: JSON.stringify([secondQuestionId]),
      player1SeenIds: JSON.stringify([questionId, secondQuestionId]),
      player1Progress: JSON.stringify(1),
    }));
    expect(socket.emit).toHaveBeenCalledWith('answer:result', expect.objectContaining({
      isCorrect: true,
      yourScore: 1,
    }));
    expect(socket.emit).toHaveBeenCalledWith('game:question', expect.objectContaining({
      question: expect.objectContaining({ id: secondQuestionId }),
      questionNumber: 2,
      totalQuestions: 2,
    }));
  });

  it('rejects answer:submit when questionId is not the queue head', async () => {
    const staleQuestionId = '00000000-0000-4000-8000-000000000004';
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState()));
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('answer:submit')?.({
      gameId,
      questionId: staleQuestionId,
      typedAnswer: '42',
    });

    expect(redis.multi).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('rotates queue head to tail on question:skip and emits next question', async () => {
    const secondQuestionId = '00000000-0000-4000-8000-000000000005';
    const multi = createMultiFromMock();
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState({
      questionIds: [questionId, secondQuestionId],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q1', options: null, passageId: null },
        [secondQuestionId]: { id: secondQuestionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [secondQuestionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
      },
      player1Queue: [questionId, secondQuestionId],
      player2Queue: [questionId, secondQuestionId],
      player1SeenIds: [questionId],
      player2SeenIds: [questionId],
    })));
    (redis.multi as jest.Mock).mockReturnValueOnce(multi);
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:skip')?.({ gameId, questionId });

    expect(multi.hset).toHaveBeenCalledWith(`game:${gameId}`, expect.objectContaining({
      player1Queue: JSON.stringify([secondQuestionId, questionId]),
      player1SeenIds: JSON.stringify([questionId, secondQuestionId]),
    }));
    expect(socket.emit).toHaveBeenCalledWith('game:question', expect.objectContaining({
      question: expect.objectContaining({ id: secondQuestionId }),
      questionNumber: 2,
      totalQuestions: 2,
    }));
  });

  it('emits opponent:progress with questionsSkipped after a skip', async () => {
    const secondQuestionId = '00000000-0000-4000-8000-000000000006';
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState({
      questionIds: [questionId, secondQuestionId],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q1', options: null, passageId: null },
        [secondQuestionId]: { id: secondQuestionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [secondQuestionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
      },
      player1Queue: [questionId, secondQuestionId],
      player2Queue: [questionId, secondQuestionId],
      player1SeenIds: [questionId],
      player2SeenIds: [questionId],
    })));
    const opponentEmit = jest.fn();
    const { socket, socketHandlers } = createHarness();
    (socket.to as jest.Mock).mockReturnValue({ emit: opponentEmit });

    await socketHandlers.get('question:skip')?.({ gameId, questionId });

    expect(opponentEmit).toHaveBeenCalledWith('opponent:progress', {
      questionsAnswered: 0,
      questionsSkipped: 1,
    });
  });

  it('emits opponent:progress shape (not null) when skipping a single-question queue', async () => {
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState()));
    const opponentEmit = jest.fn();
    const { socket, socketHandlers } = createHarness();
    (socket.to as jest.Mock).mockReturnValue({ emit: opponentEmit });

    await socketHandlers.get('question:skip')?.({ gameId, questionId });

    expect(opponentEmit).toHaveBeenCalledWith('opponent:progress', {
      questionsAnswered: 0,
      questionsSkipped: 1,
    });
  });

  it('rejects question:skip when questionId is not the queue head', async () => {
    const otherQuestionId = '00000000-0000-4000-8000-000000000007';
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState()));
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:skip')?.({ gameId, questionId: otherQuestionId });

    expect(redis.multi).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('reorders queue on question:jump placing current right behind target so answer returns to caller', async () => {
    // Scenario: player has skipped q1 and q2, currently on q3. Jumps back to q1.
    const q2 = '00000000-0000-4000-8000-000000000010';
    const q3 = '00000000-0000-4000-8000-000000000011';
    const multi = createMultiFromMock();
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState({
      questionIds: [questionId, q2, q3],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q1', options: null, passageId: null },
        [q2]: { id: q2, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
        [q3]: { id: q3, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q3', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [q2]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
        [q3]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '44' },
      },
      player1Queue: [q3, questionId, q2],
      player2Queue: [q3, questionId, q2],
      player1SeenIds: [questionId, q2, q3],
      player2SeenIds: [questionId, q2, q3],
    })));
    (redis.multi as jest.Mock).mockReturnValueOnce(multi);
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:jump')?.({ gameId, questionId });

    expect(multi.hset).toHaveBeenCalledWith(`game:${gameId}`, expect.objectContaining({
      player1Queue: JSON.stringify([questionId, q3, q2]),
    }));
    expect(socket.emit).toHaveBeenCalledWith('game:question', expect.objectContaining({
      question: expect.objectContaining({ id: questionId }),
      questionNumber: 1,
      totalQuestions: 3,
    }));
  });

  it('returns to a fresh pre-jump question after answering a jumped-to skipped question', async () => {
    // Scenario: player skipped q1 and q2 (cycled past them), currently on fresh q3.
    // They tap q1 in navigator and answer it. Expectation: next served question is
    // q3 (where they were, fresh) — NOT q2 (the other skipped Q).
    const q2 = '00000000-0000-4000-8000-000000000020';
    const q3 = '00000000-0000-4000-8000-000000000021';
    const baseState = activeGameState({
      questionIds: [questionId, q2, q3],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q1', options: null, passageId: null },
        [q2]: { id: q2, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
        [q3]: { id: q3, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q3', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [q2]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
        [q3]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '44' },
      },
      player1Queue: [q3, questionId, q2],
      player2Queue: [q3, questionId, q2],
      player1SeenIds: [questionId, q2, q3],
      player2SeenIds: [questionId, q2, q3],
      player1SkippedIds: [questionId, q2],
    });
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock)
      .mockResolvedValueOnce(serializeState(baseState))
      .mockResolvedValueOnce(serializeState({
        ...baseState,
        player1Queue: [questionId, q3, q2],
      }));
    (redis.multi as jest.Mock).mockReturnValueOnce(createMultiFromMock()).mockReturnValueOnce(createMultiFromMock());
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:jump')?.({ gameId, questionId });
    (socket.emit as jest.Mock).mockClear();
    await socketHandlers.get('answer:submit')?.({ gameId, questionId, typedAnswer: '42' });

    expect(socket.emit).toHaveBeenCalledWith('game:question', expect.objectContaining({
      question: expect.objectContaining({ id: q3 }),
      questionNumber: 3,
      totalQuestions: 3,
    }));
  });

  it('does NOT mark the fresh pre-jump question as skipped when jumping away', async () => {
    // Bug regression: jumping to a skipped Q must not auto-mark the previous
    // current (a fresh, never-skipped Q) as skipped.
    const q2 = '00000000-0000-4000-8000-000000000030';
    const q3 = '00000000-0000-4000-8000-000000000031';
    (redis.type as jest.Mock).mockResolvedValue('hash');
    const multi = createMultiFromMock();
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState({
      questionIds: [questionId, q2, q3],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q1', options: null, passageId: null },
        [q2]: { id: q2, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
        [q3]: { id: q3, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q3', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [q2]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
        [q3]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '44' },
      },
      player1Queue: [q3, questionId, q2],
      player2Queue: [q3, questionId, q2],
      player1SeenIds: [questionId, q2, q3],
      player2SeenIds: [questionId, q2, q3],
      player1SkippedIds: [questionId, q2],
    })));
    (redis.multi as jest.Mock).mockReturnValueOnce(multi);
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:jump')?.({ gameId, questionId });

    // skippedIds field is NOT in the persist payload, and the emitted skippedIds
    // contains only the originally-skipped Qs (q1, q2) — q3 is NOT added.
    const hsetPayload = (multi.hset.mock.calls[0]?.[1] ?? {}) as Record<string, string>;
    expect(hsetPayload).not.toHaveProperty('player1SkippedIds');
    expect(socket.emit).toHaveBeenCalledWith('game:question', expect.objectContaining({
      yourSkippedIds: [questionId, q2],
    }));
  });

  it('rotates the cycle to start at target so answer advances to target\'s natural successor', async () => {
    // Regression for user-reported bug: in cycle mode, jumping to an out-of-order
    // skipped Q and answering it should leave the player at target's natural next
    // in the cycle ring — NOT at the original current's old next.
    // Scenario: queue [q3, q4, q8, q10, q2] all in skippedIds, current q3.
    // Jump to q8, answer it. Expectation: next served is q10 (q8's successor in
    // the original ring), NOT q4 (q3's original successor).
    const q2 = '00000000-0000-4000-8000-000000000060';
    const q3 = '00000000-0000-4000-8000-000000000061';
    const q4 = '00000000-0000-4000-8000-000000000062';
    const q8 = '00000000-0000-4000-8000-000000000063';
    const q10 = '00000000-0000-4000-8000-000000000064';
    const baseState = activeGameState({
      questionIds: [q2, q3, q4, q8, q10],
      questions: {
        [q2]: { id: q2, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
        [q3]: { id: q3, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q3', options: null, passageId: null },
        [q4]: { id: q4, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q4', options: null, passageId: null },
        [q8]: { id: q8, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q8', options: null, passageId: null },
        [q10]: { id: q10, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q10', options: null, passageId: null },
      },
      answerKeys: {
        [q2]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '2' },
        [q3]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '3' },
        [q4]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '4' },
        [q8]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '8' },
        [q10]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '10' },
      },
      player1Queue: [q3, q4, q8, q10, q2],
      player2Queue: [q3, q4, q8, q10, q2],
      player1SeenIds: [q2, q3, q4, q8, q10],
      player2SeenIds: [q2, q3, q4, q8, q10],
      player1SkippedIds: [q2, q3, q4, q8, q10],
    });
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock)
      .mockResolvedValueOnce(serializeState(baseState))
      .mockResolvedValueOnce(serializeState({
        ...baseState,
        player1Queue: [q8, q10, q2, q3, q4],
      }));
    (redis.multi as jest.Mock).mockReturnValueOnce(createMultiFromMock()).mockReturnValueOnce(createMultiFromMock());
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:jump')?.({ gameId, questionId: q8 });
    (socket.emit as jest.Mock).mockClear();
    await socketHandlers.get('answer:submit')?.({ gameId, questionId: q8, typedAnswer: '8' });

    expect(socket.emit).toHaveBeenCalledWith('game:question', expect.objectContaining({
      question: expect.objectContaining({ id: q10 }),
    }));
  });

  it('continues cycling skipped queue when jumping in cycle mode (current was skipped)', async () => {
    // Scenario: all questions seen+skipped. Player on q1 (a previously-skipped Q),
    // cycling. They tap q2 in navigator (also skipped) and answer it.
    // Expectation: next served is q3 (the natural next in cycle), NOT q1 — because
    // q1 was an already-skipped Q and the user is in cycle mode.
    const q2 = '00000000-0000-4000-8000-000000000040';
    const q3 = '00000000-0000-4000-8000-000000000041';
    const baseState = activeGameState({
      questionIds: [questionId, q2, q3],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q1', options: null, passageId: null },
        [q2]: { id: q2, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
        [q3]: { id: q3, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q3', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [q2]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
        [q3]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '44' },
      },
      player1Queue: [questionId, q2, q3],
      player2Queue: [questionId, q2, q3],
      player1SeenIds: [questionId, q2, q3],
      player2SeenIds: [questionId, q2, q3],
      player1SkippedIds: [questionId, q2, q3],
    });
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock)
      .mockResolvedValueOnce(serializeState(baseState))
      .mockResolvedValueOnce(serializeState({
        ...baseState,
        player1Queue: [q2, q3, questionId],
      }));
    (redis.multi as jest.Mock).mockReturnValueOnce(createMultiFromMock()).mockReturnValueOnce(createMultiFromMock());
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:jump')?.({ gameId, questionId: q2 });
    (socket.emit as jest.Mock).mockClear();
    await socketHandlers.get('answer:submit')?.({ gameId, questionId: q2, typedAnswer: '43' });

    expect(socket.emit).toHaveBeenCalledWith('game:question', expect.objectContaining({
      question: expect.objectContaining({ id: q3 }),
    }));
  });

  it('removes the answered question from skippedIds and emits the new list', async () => {
    const q2 = '00000000-0000-4000-8000-000000000050';
    const multi = createMultiFromMock();
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState({
      questionIds: [questionId, q2],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q1', options: null, passageId: null },
        [q2]: { id: q2, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [q2]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
      },
      // Player previously skipped q1 (now cycled back to it via answering q2 first
      // — but for this test we just place q1 at head with q1 in skippedIds).
      player1Queue: [questionId, q2],
      player2Queue: [questionId, q2],
      player1SeenIds: [questionId, q2],
      player2SeenIds: [questionId, q2],
      player1SkippedIds: [questionId],
    })));
    (redis.multi as jest.Mock).mockReturnValueOnce(multi);
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('answer:submit')?.({ gameId, questionId, typedAnswer: '42' });

    expect(multi.hset).toHaveBeenCalledWith(`game:${gameId}`, expect.objectContaining({
      player1SkippedIds: JSON.stringify([]),
    }));
    expect(socket.emit).toHaveBeenCalledWith('game:question', expect.objectContaining({
      question: expect.objectContaining({ id: q2 }),
      yourSkippedIds: [],
    }));
  });

  it('rejects question:jump when target is not in seenIds', async () => {
    const unseen = '00000000-0000-4000-8000-000000000012';
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState()));
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:jump')?.({ gameId, questionId: unseen });

    expect(redis.multi).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('rejects question:jump when target is already answered', async () => {
    const q2 = '00000000-0000-4000-8000-000000000013';
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState({
      questionIds: [questionId, q2],
      questions: {
        [questionId]: { id: questionId, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q1', options: null, passageId: null },
        [q2]: { id: q2, category: 'QUANT', questionType: 'TITA', subTopic: null, subType: null, difficulty: 1, text: 'Q2', options: null, passageId: null },
      },
      answerKeys: {
        [questionId]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '42' },
        [q2]: { questionType: 'TITA', correctAnswer: null, correctAnswerText: '43' },
      },
      player1Queue: [q2],
      player2Queue: [q2],
      player1SeenIds: [questionId, q2],
      player2SeenIds: [questionId, q2],
      player1Answers: { [questionId]: { selected: null, typed: '42', correct: true, timeMs: 1000 } },
      player1Progress: 1,
    })));
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:jump')?.({ gameId, questionId });

    expect(redis.multi).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('rejects question:jump when target is the current queue head', async () => {
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState()));
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('question:jump')?.({ gameId, questionId });

    expect(redis.multi).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('rejects answers that pass transport schema but do not match the server-side question type', async () => {
    (redis.type as jest.Mock).mockResolvedValue('hash');
    (redis.hgetall as jest.Mock).mockResolvedValue(serializeState(activeGameState()));
    const { socket, socketHandlers } = createHarness();

    await socketHandlers.get('answer:submit')?.({
      gameId,
      questionId,
      selectedAnswer: 2,
    });

    expect(redis.type).toHaveBeenCalledWith(`game:${gameId}`);
    expect(redis.hgetall).toHaveBeenCalledWith(`game:${gameId}`);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.multi).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
