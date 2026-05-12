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

jest.mock('../../config/redis', () => ({
  redis: mockRedis,
}));

jest.mock('../matchmaking', () => ({
  createMatch: jest.fn(),
}));

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

import { createMatch } from '../matchmaking';
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
      key === 'queue_joined:p1' ? String(NOW - 31_000) : null
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
      NOW + 30_001,
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
      if (key === 'queue_joined:p1') return String(NOW - 61_000);
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
});
