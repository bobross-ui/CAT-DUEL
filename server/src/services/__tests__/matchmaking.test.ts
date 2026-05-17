const mockRedis = {
  del: jest.fn(),
  get: jest.fn(),
  zrem: jest.fn(),
};

jest.mock('../../config/env', () => ({
  env: {
    GAME_DURATION_SECONDS: 600,
  },
}));

jest.mock('../../config/redis', () => ({
  redis: mockRedis,
}));

jest.mock('../../models/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../gameSession', () => ({
  autojoinBotPlayer: jest.fn(),
  getActiveGameForUser: jest.fn(),
  getPendingMatchForUser: jest.fn(),
  initializeGame: jest.fn(),
  GUEST_DURATION_SECONDS: 180,
}));

jest.mock('../botPlayer', () => ({
  getBotForPlayer: jest.fn(),
  botBusyKey: (id: string) => `bot_busy:${id}`,
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
  },
}));

import type { Namespace } from 'socket.io';
import { prisma } from '../../models/prisma';
import { autojoinBotPlayer, initializeGame } from '../gameSession';
import { getBotForPlayer } from '../botPlayer';
import { createGuestMatch, createMatch, CreateMatchError, GuestMatchError } from '../matchmaking';

const GAME_ID = '00000000-0000-4000-8000-000000000001' as ReturnType<typeof crypto.randomUUID>;

function user(overrides: Partial<{
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  eloRating: number;
  gamesPlayed: number;
  winRate: number;
  isBot: boolean;
  isGuest: boolean;
}> = {}) {
  return {
    id: 'user-1',
    displayName: 'User One',
    avatarUrl: null,
    eloRating: 1200,
    gamesPlayed: 30,
    winRate: 0.5,
    isBot: false,
    isGuest: false,
    ...overrides,
  };
}

function namespace(emitImpl?: jest.Mock) {
  const emit = emitImpl ?? jest.fn();
  const to = jest.fn(() => ({ emit }));

  return {
    ns: { to } as unknown as Namespace,
    emit,
    to,
  };
}

const findUnique = prisma.user.findUnique as jest.Mock;
const mockedInitializeGame = initializeGame as jest.Mock;
const mockedAutojoinBotPlayer = autojoinBotPlayer as jest.Mock;

describe('createMatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(GAME_ID);
    mockRedis.del.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.zrem.mockResolvedValue(1);
    mockedInitializeGame.mockResolvedValue(undefined);
    mockedAutojoinBotPlayer.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws a preflight CreateMatchError without Redis writes when a matched user is missing', async () => {
    findUnique
      .mockResolvedValueOnce(user({ id: 'human-1' }))
      .mockResolvedValueOnce(null);
    const { ns: matchmakingNs } = namespace();
    const { ns: gameNs } = namespace();

    let error: unknown;
    try {
      await createMatch(
        matchmakingNs,
        gameNs,
        { userId: 'human-1', elo: 1200 },
        { userId: 'missing', elo: 1250 },
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(CreateMatchError);
    expect(error).toMatchObject({ phase: 'preflight', gameId: undefined });
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockRedis.zrem).not.toHaveBeenCalled();
    expect(mockRedis.del).not.toHaveBeenCalled();
    expect(mockedInitializeGame).not.toHaveBeenCalled();
  });

  it('initializes human-vs-human matches and emits match:found to both sockets', async () => {
    findUnique
      .mockResolvedValueOnce(user({ id: 'human-1', eloRating: 1200 }))
      .mockResolvedValueOnce(user({ id: 'human-2', eloRating: 1250 }));
    mockRedis.get
      .mockResolvedValueOnce('socket-1')
      .mockResolvedValueOnce('socket-2');
    const { ns: matchmakingNs, emit, to } = namespace();
    const { ns: gameNs } = namespace();

    await createMatch(
      matchmakingNs,
      gameNs,
      { userId: 'human-1', elo: 1200 },
      { userId: 'human-2', elo: 1250 },
    );

    expect(mockedInitializeGame).toHaveBeenCalledWith(
      GAME_ID,
      { userId: 'human-1', elo: 1200 },
      { userId: 'human-2', elo: 1250 },
      expect.objectContaining({
        player1IsBot: false,
        player2IsBot: false,
        gameNs,
      }),
    );
    expect(to).toHaveBeenCalledWith('socket-1');
    expect(to).toHaveBeenCalledWith('socket-2');
    expect(emit).toHaveBeenCalledTimes(2);
    expect(mockedAutojoinBotPlayer).not.toHaveBeenCalled();
  });

  it('autojoin bots before emitting match:found to the human and skips bot socket emits', async () => {
    findUnique
      .mockResolvedValueOnce(user({ id: 'human-1', eloRating: 1200 }))
      .mockResolvedValueOnce(user({ id: 'bot-1', eloRating: 1210, isBot: true }));
    mockRedis.get
      .mockResolvedValueOnce('socket-human')
      .mockResolvedValueOnce('socket-bot');
    const { ns: matchmakingNs, emit, to } = namespace();
    const { ns: gameNs } = namespace();

    await createMatch(
      matchmakingNs,
      gameNs,
      { userId: 'human-1', elo: 1200 },
      { userId: 'bot-1', elo: 1210 },
    );

    expect(mockedInitializeGame).toHaveBeenCalledWith(
      GAME_ID,
      { userId: 'human-1', elo: 1200 },
      { userId: 'bot-1', elo: 1210 },
      expect.objectContaining({
        player1IsBot: false,
        player2IsBot: true,
      }),
    );
    expect(mockedAutojoinBotPlayer).toHaveBeenCalledWith(GAME_ID, 'bot-1', gameNs);
    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith('socket-human');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][1]).toMatchObject({
      gameId: GAME_ID,
      duration: 600,
      opponent: expect.objectContaining({ userId: 'bot-1' }),
    });
    expect('isBot' in emit.mock.calls[0][1].opponent).toBe(false);
    expect(mockedAutojoinBotPlayer.mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[0],
    );
  });

});

describe('createGuestMatch', () => {
  const mockedGetBotForPlayer = getBotForPlayer as jest.Mock;
  const GUEST_ID = 'guest-1';
  const BOT_ID = 'bot-1';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(GAME_ID);
    mockRedis.del.mockResolvedValue(1);
    mockedInitializeGame.mockResolvedValue(undefined);
    mockedAutojoinBotPlayer.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects when the caller is not a guest', async () => {
    findUnique.mockResolvedValueOnce(user({ id: GUEST_ID, isGuest: false }));
    const { ns: matchmakingNs } = namespace();
    const { ns: gameNs } = namespace();

    await expect(
      createGuestMatch(matchmakingNs, gameNs, GUEST_ID, 'socket-1'),
    ).rejects.toMatchObject({ code: 'NOT_GUEST' });

    expect(mockedGetBotForPlayer).not.toHaveBeenCalled();
    expect(mockedInitializeGame).not.toHaveBeenCalled();
  });

  it('rejects when the guest has already played', async () => {
    findUnique.mockResolvedValueOnce(user({ id: GUEST_ID, isGuest: true, gamesPlayed: 1 }));
    const { ns: matchmakingNs } = namespace();
    const { ns: gameNs } = namespace();

    await expect(
      createGuestMatch(matchmakingNs, gameNs, GUEST_ID, 'socket-1'),
    ).rejects.toMatchObject({ code: 'ALREADY_PLAYED' });

    expect(mockedGetBotForPlayer).not.toHaveBeenCalled();
    expect(mockedInitializeGame).not.toHaveBeenCalled();
  });

  it('rejects when no bot is available', async () => {
    findUnique.mockResolvedValueOnce(user({ id: GUEST_ID, isGuest: true, gamesPlayed: 0 }));
    mockedGetBotForPlayer.mockResolvedValueOnce(null);
    const { ns: matchmakingNs } = namespace();
    const { ns: gameNs } = namespace();

    await expect(
      createGuestMatch(matchmakingNs, gameNs, GUEST_ID, 'socket-1'),
    ).rejects.toMatchObject({ code: 'NO_BOT_AVAILABLE' });

    expect(mockedInitializeGame).not.toHaveBeenCalled();
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('initializes the match in guest_practice mode, autojoins the bot, and emits match:found with GUEST_DURATION_SECONDS', async () => {
    findUnique.mockResolvedValueOnce(user({ id: GUEST_ID, isGuest: true, gamesPlayed: 0, eloRating: 1200 }));
    mockedGetBotForPlayer.mockResolvedValueOnce(user({ id: BOT_ID, isBot: true, eloRating: 1180 }));
    const { ns: matchmakingNs, emit, to } = namespace();
    const { ns: gameNs } = namespace();

    await createGuestMatch(matchmakingNs, gameNs, GUEST_ID, 'socket-guest');

    expect(mockedInitializeGame).toHaveBeenCalledWith(
      GAME_ID,
      { userId: GUEST_ID, elo: 1200 },
      { userId: BOT_ID, elo: 1180 },
      expect.objectContaining({
        mode: 'guest_practice',
        player1IsBot: false,
        player2IsBot: true,
        gameNs,
      }),
    );
    expect(mockedAutojoinBotPlayer).toHaveBeenCalledWith(GAME_ID, BOT_ID, gameNs);
    expect(to).toHaveBeenCalledWith('socket-guest');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe('match:found');
    expect(emit.mock.calls[0][1]).toMatchObject({
      gameId: GAME_ID,
      duration: 180,
      opponent: expect.objectContaining({ userId: BOT_ID }),
    });
    expect(mockedAutojoinBotPlayer.mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[0],
    );
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('releases bot_busy if initializeGame throws after the bot was claimed', async () => {
    findUnique.mockResolvedValueOnce(user({ id: GUEST_ID, isGuest: true, gamesPlayed: 0 }));
    mockedGetBotForPlayer.mockResolvedValueOnce(user({ id: BOT_ID, isBot: true, eloRating: 1200 }));
    mockedInitializeGame.mockRejectedValueOnce(new Error('init failed'));
    const { ns: matchmakingNs } = namespace();
    const { ns: gameNs } = namespace();

    await expect(
      createGuestMatch(matchmakingNs, gameNs, GUEST_ID, 'socket-guest'),
    ).rejects.toThrow('init failed');

    expect(mockRedis.del).toHaveBeenCalledWith(`bot_busy:${BOT_ID}`);
  });

  it('does not release bot_busy if the failure is post-commit (after initializeGame)', async () => {
    findUnique.mockResolvedValueOnce(user({ id: GUEST_ID, isGuest: true, gamesPlayed: 0 }));
    mockedGetBotForPlayer.mockResolvedValueOnce(user({ id: BOT_ID, isBot: true, eloRating: 1200 }));
    mockedAutojoinBotPlayer.mockRejectedValueOnce(new Error('autojoin failed'));
    const { ns: matchmakingNs } = namespace();
    const { ns: gameNs } = namespace();

    await expect(
      createGuestMatch(matchmakingNs, gameNs, GUEST_ID, 'socket-guest'),
    ).rejects.toThrow('autojoin failed');

    // bot_busy is owned by gameSession's lifecycle from here on (cancelPreStartGame / persistMatch)
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('preserves GuestMatchError instance identity for socket-layer dispatch', async () => {
    findUnique.mockResolvedValueOnce(user({ id: GUEST_ID, isGuest: true, gamesPlayed: 2 }));
    const { ns: matchmakingNs } = namespace();
    const { ns: gameNs } = namespace();

    let error: unknown;
    try {
      await createGuestMatch(matchmakingNs, gameNs, GUEST_ID, 'socket-1');
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(GuestMatchError);
  });
});

describe('createMatch post-commit failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(GAME_ID);
    mockRedis.del.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.zrem.mockResolvedValue(1);
    mockedInitializeGame.mockResolvedValue(undefined);
    mockedAutojoinBotPlayer.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('wraps failures after initializeGame as post-commit with the game id', async () => {
    const emitError = new Error('emit failed');
    findUnique
      .mockResolvedValueOnce(user({ id: 'human-1', eloRating: 1200 }))
      .mockResolvedValueOnce(user({ id: 'human-2', eloRating: 1250 }));
    mockRedis.get
      .mockResolvedValueOnce('socket-1')
      .mockResolvedValueOnce(null);
    const { ns: matchmakingNs } = namespace(jest.fn(() => {
      throw emitError;
    }));
    const { ns: gameNs } = namespace();

    let error: unknown;
    try {
      await createMatch(
        matchmakingNs,
        gameNs,
        { userId: 'human-1', elo: 1200 },
        { userId: 'human-2', elo: 1250 },
      );
    } catch (err) {
      error = err;
    }

    expect(mockedInitializeGame).toHaveBeenCalled();
    expect(error).toBeInstanceOf(CreateMatchError);
    expect(error).toMatchObject({
      phase: 'post-commit',
      gameId: GAME_ID,
      cause: emitError,
    });
  });
});
