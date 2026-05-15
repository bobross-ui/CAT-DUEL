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
    set: jest.fn(),
    type: jest.fn(),
  },
}));

jest.mock('../socketRateLimit', () => ({
  enforceSocketEventLimit: jest.fn(),
}));

const mockRollBotCorrect = jest.fn();

jest.mock('../botPlayer', () => ({
  botBusyKey: (botId: string) => `bot_busy:${botId}`,
  rollBotCorrect: mockRollBotCorrect,
}));

import { redis } from '../../config/redis';
import {
  autojoinBotPlayer,
  isAnswerLate,
  startBotAnswering,
  submitBotAnswer,
} from '../gameSession';

const gameId = 'game-1';

function serializeState(state: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(state).map(([key, value]) => [key, JSON.stringify(value)]),
  );
}

function createMulti() {
  return {
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
    expire: jest.fn().mockReturnThis(),
    hset: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
}

function activeBotGameState(overrides: Record<string, unknown> = {}) {
  const now = Date.now();

  return {
    gameId,
    status: 'ACTIVE',
    player1Id: 'human-1',
    player2Id: 'bot-1',
    player1IsBot: false,
    player2IsBot: true,
    player1Profile: { userId: 'human-1', displayName: null, avatarUrl: null, eloRating: 1200, gamesPlayed: 30, winRate: 0.5 },
    player2Profile: { userId: 'bot-1', displayName: null, avatarUrl: null, eloRating: 1200, gamesPlayed: 30, winRate: 0.5 },
    player1RatingImpact: { win: 10, loss: -10 },
    player2RatingImpact: { win: 10, loss: -10 },
    questionIds: ['q1'],
    questions: {
      q1: {
        id: 'q1',
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
      q1: {
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
    startedAt: now,
    createdAt: now,
    ...overrides,
  };
}

function gameNamespace() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));

  return { emit, to };
}

describe('isAnswerLate', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns false when startedAt is null', () => {
    expect(isAnswerLate(null, 600)).toBe(false);
  });

  it('returns false while game clock is still running', () => {
    const startedAt = Date.now() - 100_000; // 100s elapsed out of 600s
    expect(isAnswerLate(startedAt, 600)).toBe(false);
  });

  it('returns true after the full game duration has elapsed', () => {
    const startedAt = Date.now() - 700_000; // 700s elapsed, game was 600s
    expect(isAnswerLate(startedAt, 600)).toBe(true);
  });

  it('accepts an explicit now timestamp for deterministic testing', () => {
    const startedAt = 1_000;
    expect(isAnswerLate(startedAt, 600, 601_000)).toBe(false); // exactly at boundary
    expect(isAnswerLate(startedAt, 600, 601_001)).toBe(true);  // one ms over
  });
});

describe('bot game session runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRollBotCorrect.mockReturnValue(true);
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.hmget as jest.Mock).mockResolvedValue([]);
    (redis.hgetall as jest.Mock).mockResolvedValue({});
    (redis.set as jest.Mock).mockResolvedValue('OK');
    (redis.type as jest.Mock).mockResolvedValue('hash');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('submits a TITA bot answer with the scheduled delay as timeTakenMs', async () => {
    const multi = createMulti();
    (redis.multi as jest.Mock).mockReturnValueOnce(multi);
    (redis.hgetall as jest.Mock).mockResolvedValueOnce(serializeState(activeBotGameState()));
    const gameNs = gameNamespace();

    await submitBotAnswer(gameId, 'bot-1', 45_000, gameNs as never);

    expect(mockRollBotCorrect).toHaveBeenCalledWith(1200, 1200);
    expect(multi.hset).toHaveBeenCalledWith(`game:${gameId}`, {
      player2Answers: JSON.stringify({
        q1: {
          selected: null,
          typed: '42',
          correct: true,
          timeMs: 45_000,
        },
      }),
      player2Progress: JSON.stringify(1),
      player2Score: JSON.stringify(1),
    });
    expect(gameNs.to).toHaveBeenCalledWith(gameId);
    expect(gameNs.emit).toHaveBeenCalledWith('opponent:scored', { opponentScore: 1 });
    expect(gameNs.emit).toHaveBeenCalledWith('opponent:progress', {
      currentQuestion: 1,
      questionsAnswered: 1,
    });
  });

  it('autojoinBotPlayer marks the bot joined and starts countdown when the human already joined', async () => {
    jest.useFakeTimers();
    const initialState = activeBotGameState({
      status: 'FOUND',
      player2Joined: false,
      joinDeadlineAt: Date.now() + 10_000,
      startedAt: null,
    });
    const readyState = { ...initialState, status: 'WAITING_FOR_PLAYERS', player2Joined: true };
    const joinMulti = createMulti();
    const countdownMulti = createMulti();
    (redis.multi as jest.Mock)
      .mockReturnValueOnce(joinMulti)
      .mockReturnValueOnce(countdownMulti);
    (redis.hgetall as jest.Mock)
      .mockResolvedValueOnce(serializeState(initialState))
      .mockResolvedValueOnce(serializeState(readyState));
    (redis.hmget as jest.Mock).mockResolvedValueOnce([
      JSON.stringify('WAITING_FOR_PLAYERS'),
      JSON.stringify(true),
      JSON.stringify(true),
    ]);
    const gameNs = gameNamespace();

    await autojoinBotPlayer(gameId, 'bot-1', gameNs as never);

    expect(joinMulti.hset).toHaveBeenCalledWith(`game:${gameId}`, {
      player2Joined: JSON.stringify(true),
      status: JSON.stringify('WAITING_FOR_PLAYERS'),
    });
    expect(redis.set).toHaveBeenCalledWith(`game:${gameId}:starting`, '1', 'EX', 30, 'NX');
    expect(gameNs.emit).toHaveBeenCalledWith('game:countdown', { seconds: 3 });
    expect(jest.getTimerCount()).toBe(1);
  });

  it('startBotAnswering replaces an existing bot timer for the game', () => {
    jest.useFakeTimers();
    const gameNs = gameNamespace();

    startBotAnswering(gameId, 'bot-1', gameNs as never);
    startBotAnswering(gameId, 'bot-1', gameNs as never);

    expect(jest.getTimerCount()).toBe(1);
  });
});
