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

function activeGameState(overrides: Record<string, unknown> = {}) {
  return {
    gameId,
    status: 'ACTIVE',
    player1Id: 'user-1',
    player2Id: 'user-2',
    player1Profile: { userId: 'user-1', displayName: null, avatarUrl: null, eloRating: 1200 },
    player2Profile: { userId: 'user-2', displayName: null, avatarUrl: null, eloRating: 1200 },
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
