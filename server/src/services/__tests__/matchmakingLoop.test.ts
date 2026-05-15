const mockRedis = {
  del: jest.fn(),
  eval: jest.fn(),
  get: jest.fn(),
  zadd: jest.fn(),
  zrangebyscore: jest.fn(),
  zrem: jest.fn(),
  zrevrangebyscore: jest.fn(),
  zscore: jest.fn(),
};
const mockGetBotForPlayer = jest.fn();

jest.mock('../../config/redis', () => ({
  redis: mockRedis,
}));

jest.mock('../botPlayer', () => ({
  botBusyKey: (botId: string) => `bot_busy:${botId}`,
  getBotForPlayer: mockGetBotForPlayer,
}));

jest.mock('../matchmaking', () => {
  class CreateMatchError extends Error {
    phase: 'preflight' | 'post-commit';
    cause: unknown;
    gameId?: string;

    constructor(phase: 'preflight' | 'post-commit', cause: unknown, metadata: { gameId?: string } = {}) {
      super('createMatch failed');
      this.phase = phase;
      this.cause = cause;
      this.gameId = metadata.gameId;
    }
  }

  return {
    createMatch: jest.fn(),
    CreateMatchError,
  };
});

jest.mock('../../lib/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('../../lib/sentry', () => ({
  Sentry: {
    captureException: jest.fn(),
  },
}));

import { CreateMatchError, createMatch } from '../matchmaking';
import { runMatchmaking } from '../matchmakingLoop';
import type { Namespace } from 'socket.io';

const NOW = 1_000_000;

function namespaces() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));

  return {
    matchmakingNs: { to },
    gameNs: {},
    emit,
    to,
  };
}

describe('runMatchmaking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    mockRedis.del.mockResolvedValue(1);
    mockRedis.eval.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.zadd.mockResolvedValue(1);
    mockRedis.zrangebyscore.mockResolvedValue([]);
    mockRedis.zrem.mockResolvedValue(1);
    mockRedis.zrevrangebyscore.mockResolvedValue([]);
    mockRedis.zscore.mockResolvedValue(null);
    mockGetBotForPlayer.mockResolvedValue(null);
    (createMatch as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('processes a bounded due batch and matches by nearby Elo queries', async () => {
    const { matchmakingNs, gameNs } = namespaces();
    mockRedis.zrangebyscore
      .mockResolvedValueOnce(['p1'])
      .mockResolvedValueOnce(['p1', '1000', 'p2', '1080']);
    mockRedis.zrevrangebyscore.mockResolvedValueOnce(['p1', '1000']);
    mockRedis.zscore.mockResolvedValueOnce('1000');
    mockRedis.get.mockImplementation(async (key: string) => (
      key === 'queue_joined:p1' ? String(NOW) : null
    ));

    await runMatchmaking(matchmakingNs as unknown as Namespace, gameNs as unknown as Namespace);

    expect(mockRedis.zrangebyscore).toHaveBeenNthCalledWith(
      1,
      'matchmaking_queue_due',
      '-inf',
      NOW,
      'LIMIT',
      0,
      100,
    );
    expect(mockRedis.zrangebyscore).toHaveBeenCalledWith(
      'matchmaking_queue',
      1000,
      1150,
      'WITHSCORES',
      'LIMIT',
      0,
      50,
    );
    expect(mockRedis.zrevrangebyscore).toHaveBeenCalledWith(
      'matchmaking_queue',
      1000,
      850,
      'WITHSCORES',
      'LIMIT',
      0,
      50,
    );
    expect(mockRedis.zrangebyscore).not.toHaveBeenCalledWith(
      'matchmaking_queue',
      '-inf',
      '+inf',
      'WITHSCORES',
    );
    expect(createMatch).toHaveBeenCalledWith(
      matchmakingNs,
      gameNs,
      { userId: 'p1', elo: 1000 },
      { userId: 'p2', elo: 1080 },
    );
  });

  it('uses the expanded Elo range after the wait threshold', async () => {
    const { matchmakingNs, gameNs } = namespaces();
    mockRedis.zrangebyscore
      .mockResolvedValueOnce(['p1'])
      .mockResolvedValueOnce(['p1', '1000', 'p2', '1250']);
    mockRedis.zrevrangebyscore.mockResolvedValueOnce(['p1', '1000']);
    mockRedis.zscore.mockResolvedValueOnce('1000');
    mockRedis.get.mockImplementation(async (key: string) => (
      key === 'queue_joined:p1' ? String(NOW - 11_000) : null
    ));

    await runMatchmaking(matchmakingNs as unknown as Namespace, gameNs as unknown as Namespace);

    expect(mockRedis.zrangebyscore).toHaveBeenCalledWith(
      'matchmaking_queue',
      1000,
      1300,
      'WITHSCORES',
      'LIMIT',
      0,
      50,
    );
    expect(createMatch).toHaveBeenCalledWith(
      matchmakingNs,
      gameNs,
      { userId: 'p1', elo: 1000 },
      { userId: 'p2', elo: 1250 },
    );
  });

  it('reschedules unmatched players for their next meaningful check', async () => {
    const { matchmakingNs, gameNs } = namespaces();
    mockRedis.zrangebyscore
      .mockResolvedValueOnce(['p1'])
      .mockResolvedValueOnce([]);
    mockRedis.zrevrangebyscore.mockResolvedValueOnce([]);
    mockRedis.zscore.mockResolvedValueOnce('1000');
    mockRedis.get.mockImplementation(async (key: string) => (
      key === 'queue_joined:p1' ? String(NOW) : null
    ));

    await runMatchmaking(matchmakingNs as unknown as Namespace, gameNs as unknown as Namespace);

    expect(mockRedis.zadd).toHaveBeenCalledWith(
      'matchmaking_queue_due',
      NOW + 10_001,
      'p1',
    );
    expect(createMatch).not.toHaveBeenCalled();
  });

  it('times out unmatched players and removes both queue indexes', async () => {
    const { matchmakingNs, gameNs, emit, to } = namespaces();
    mockRedis.zrangebyscore
      .mockResolvedValueOnce(['p1'])
      .mockResolvedValueOnce([]);
    mockRedis.zrevrangebyscore.mockResolvedValueOnce([]);
    mockRedis.zscore.mockResolvedValueOnce('1000');
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === 'queue_joined:p1') return String(NOW - 31_000);
      if (key === 'socket:mm:p1') return 'socket-1';
      return null;
    });

    await runMatchmaking(matchmakingNs as unknown as Namespace, gameNs as unknown as Namespace);

    expect(to).toHaveBeenCalledWith('socket-1');
    expect(emit).toHaveBeenCalledWith(
      'queue:timeout',
      { message: 'No match found, try again later' },
    );
    expect(mockRedis.zrem).toHaveBeenCalledWith('matchmaking_queue', 'p1');
    expect(mockRedis.zrem).toHaveBeenCalledWith('matchmaking_queue_due', 'p1');
    expect(mockRedis.del).toHaveBeenCalledWith('queue_joined:p1', 'socket:mm:p1');
    expect(createMatch).not.toHaveBeenCalled();
  });

  it('selects a bot after the expanded human search finds no candidate', async () => {
    const { matchmakingNs, gameNs } = namespaces();
    mockRedis.zrangebyscore
      .mockResolvedValueOnce(['p1'])
      .mockResolvedValueOnce([]);
    mockRedis.zrevrangebyscore.mockResolvedValueOnce([]);
    mockRedis.zscore.mockResolvedValueOnce('1000');
    mockRedis.get.mockImplementation(async (key: string) => (
      key === 'queue_joined:p1' ? String(NOW - 11_000) : null
    ));
    mockGetBotForPlayer.mockResolvedValueOnce({ id: 'bot-1', eloRating: 1040 });

    await runMatchmaking(matchmakingNs as unknown as Namespace, gameNs as unknown as Namespace);

    expect(mockGetBotForPlayer).toHaveBeenCalledWith(1000);
    expect(createMatch).toHaveBeenCalledWith(
      matchmakingNs,
      gameNs,
      { userId: 'p1', elo: 1000 },
      { userId: 'bot-1', elo: 1040 },
    );
    expect(mockRedis.zadd).not.toHaveBeenCalledWith('matchmaking_queue', 1000, 'p1');
  });

  it('requeues the human when no bot is available and continues the loop pass', async () => {
    const { matchmakingNs, gameNs } = namespaces();
    mockRedis.zrangebyscore
      .mockResolvedValueOnce(['p1', 'p2'])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockRedis.zrevrangebyscore
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockRedis.zscore
      .mockResolvedValueOnce('1000')
      .mockResolvedValueOnce('1200');
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === 'queue_joined:p1') return String(NOW - 11_000);
      if (key === 'queue_joined:p2') return String(NOW - 11_000);
      return null;
    });
    mockGetBotForPlayer
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'bot-2', eloRating: 1210 });

    await runMatchmaking(matchmakingNs as unknown as Namespace, gameNs as unknown as Namespace);

    expect(mockRedis.zadd).toHaveBeenCalledWith('matchmaking_queue', 1000, 'p1');
    expect(mockRedis.zadd).toHaveBeenCalledWith(
      'matchmaking_queue_due',
      NOW + 2_000,
      'p1',
    );
    expect(createMatch).toHaveBeenCalledWith(
      matchmakingNs,
      gameNs,
      { userId: 'p2', elo: 1200 },
      { userId: 'bot-2', elo: 1210 },
    );
  });

  it('releases bot_busy and requeues the human after a preflight bot match failure', async () => {
    const { matchmakingNs, gameNs } = namespaces();
    mockRedis.zrangebyscore
      .mockResolvedValueOnce(['p1'])
      .mockResolvedValueOnce([]);
    mockRedis.zrevrangebyscore.mockResolvedValueOnce([]);
    mockRedis.zscore.mockResolvedValueOnce('1000');
    mockRedis.get.mockImplementation(async (key: string) => (
      key === 'queue_joined:p1' ? String(NOW - 11_000) : null
    ));
    mockGetBotForPlayer.mockResolvedValueOnce({ id: 'bot-1', eloRating: 1040 });
    (createMatch as jest.Mock).mockRejectedValueOnce(
      new CreateMatchError('preflight', new Error('missing user')),
    );

    await runMatchmaking(matchmakingNs as unknown as Namespace, gameNs as unknown as Namespace);

    expect(mockRedis.del).toHaveBeenCalledWith('bot_busy:bot-1');
    expect(mockRedis.zadd).toHaveBeenCalledWith('matchmaking_queue', 1000, 'p1');
    expect(mockRedis.zadd).toHaveBeenCalledWith(
      'matchmaking_queue_due',
      NOW + 2_000,
      'p1',
    );
  });

  it('does not requeue or release bot_busy after a post-commit bot match failure', async () => {
    const { matchmakingNs, gameNs } = namespaces();
    mockRedis.zrangebyscore
      .mockResolvedValueOnce(['p1'])
      .mockResolvedValueOnce([]);
    mockRedis.zrevrangebyscore.mockResolvedValueOnce([]);
    mockRedis.zscore.mockResolvedValueOnce('1000');
    mockRedis.get.mockImplementation(async (key: string) => (
      key === 'queue_joined:p1' ? String(NOW - 11_000) : null
    ));
    mockGetBotForPlayer.mockResolvedValueOnce({ id: 'bot-1', eloRating: 1040 });
    (createMatch as jest.Mock).mockRejectedValueOnce(
      new CreateMatchError('post-commit', new Error('emit failed'), { gameId: 'game-1' }),
    );

    await expect(
      runMatchmaking(matchmakingNs as unknown as Namespace, gameNs as unknown as Namespace),
    ).rejects.toBeInstanceOf(CreateMatchError);

    expect(mockRedis.del).not.toHaveBeenCalledWith('bot_busy:bot-1');
    expect(mockRedis.zadd).not.toHaveBeenCalledWith('matchmaking_queue', 1000, 'p1');
  });
});
