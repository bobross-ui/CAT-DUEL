import express from 'express';
import type { AddressInfo } from 'net';
import gamesRouter from '../games';
import { prisma } from '../../models/prisma';

jest.mock('../../middleware/auth', () => ({
  authMiddleware: jest.fn((req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  }),
}));

jest.mock('../../services/gameSession', () => ({
  getActiveGameForUser: jest.fn(),
}));

jest.mock('../../config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('../../models/prisma', () => ({
  prisma: {
    match: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const findMany = prisma.match.findMany as jest.Mock;
const findUnique = prisma.user.findUnique as jest.Mock;

function cursorFor(match: { finishedAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({
    finishedAt: match.finishedAt.toISOString(),
    id: match.id,
  })).toString('base64url');
}

function makeMatch(id: string, finishedAt: Date, playerSide: 1 | 2 = 1) {
  const user = {
    id: 'user-1',
    displayName: 'Current User',
    avatarUrl: null,
    eloRating: 1200,
    rankTier: 'BRONZE',
    deletedAt: null,
  };
  const opponent = {
    id: `opponent-${id}`,
    displayName: `Opponent ${id}`,
    avatarUrl: null,
    eloRating: 1210,
    rankTier: 'SILVER',
    deletedAt: null,
  };

  return {
    id,
    player1Id: playerSide === 1 ? user.id : opponent.id,
    player2Id: playerSide === 1 ? opponent.id : user.id,
    winnerId: user.id,
    player1Score: playerSide === 1 ? 3 : 1,
    player2Score: playerSide === 1 ? 1 : 3,
    player1EloChange: playerSide === 1 ? 12 : -12,
    player2EloChange: playerSide === 1 ? -12 : 12,
    status: 'completed',
    durationSeconds: 300,
    finishedAt,
    player1: playerSide === 1 ? user : opponent,
    player2: playerSide === 1 ? opponent : user,
  };
}

async function getHistory(query = '') {
  const app = express();
  app.use(express.json());
  app.use('/games', gamesRouter);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/games/history${query}`);

    return {
      status: response.status,
      body: await response.json() as any,
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function getStats() {
  const app = express();
  app.use(express.json());
  app.use('/games', gamesRouter);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/games/stats`);

    return {
      status: response.status,
      body: await response.json() as any,
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('GET /games/history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses bounded cursor pagination instead of page-sized over-fetching', async () => {
    const matches = [
      makeMatch('match-3', new Date('2026-05-12T10:00:00.000Z')),
      makeMatch('match-2', new Date('2026-05-12T09:00:00.000Z'), 2),
      makeMatch('match-1', new Date('2026-05-12T08:00:00.000Z')),
    ];
    findMany.mockResolvedValueOnce(matches);

    const response = await getHistory('?page=999999&limit=2');

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ player1Id: 'user-1' }, { player2Id: 'user-1' }] },
      orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      take: 3,
    }));
    expect(response.body.data.entries).toHaveLength(2);
    expect(response.body.data.pagination).toEqual({
      cursor: null,
      limit: 2,
      nextCursor: cursorFor(matches[1]),
      hasMore: true,
    });
  });

  it('applies finishedAt and id tie-breaker filters when a cursor is provided', async () => {
    const cursorMatch = { finishedAt: new Date('2026-05-12T09:00:00.000Z'), id: 'match-2' };
    findMany.mockResolvedValueOnce([
      makeMatch('match-1', new Date('2026-05-12T08:00:00.000Z')),
    ]);

    const response = await getHistory(`?limit=2&cursor=${encodeURIComponent(cursorFor(cursorMatch))}`);

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { OR: [{ player1Id: 'user-1' }, { player2Id: 'user-1' }] },
          {
            OR: [
              { finishedAt: { lt: cursorMatch.finishedAt } },
              { finishedAt: cursorMatch.finishedAt, id: { lt: cursorMatch.id } },
            ],
          },
        ],
      },
      orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      take: 3,
    }));
    expect(response.body.data.pagination).toEqual({
      cursor: cursorFor(cursorMatch),
      limit: 2,
      nextCursor: null,
      hasMore: false,
    });
  });

  it('rejects malformed cursors before querying matches', async () => {
    const response = await getHistory('?cursor=not-a-valid-cursor');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('GET /games/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns peak Elo from the user row and only reads the latest 30 rating snapshots', async () => {
    findUnique.mockResolvedValueOnce({
      eloRating: 1250,
      peakElo: 1340,
      gamesPlayed: 42,
      rankTier: 'SILVER',
      wins: 20,
      winRate: 20 / 42,
      draws: 2,
    });
    findMany.mockResolvedValueOnce([
      {
        id: 'match-2',
        player1Id: 'opponent-2',
        player1EloAfter: 1195,
        player2EloAfter: 1250,
        finishedAt: new Date('2026-05-12T10:00:00.000Z'),
      },
      {
        id: 'match-1',
        player1Id: 'user-1',
        player1EloAfter: 1238,
        player2EloAfter: 1210,
        finishedAt: new Date('2026-05-11T10:00:00.000Z'),
      },
    ]);

    const response = await getStats();

    expect(response.status).toBe(200);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        eloRating: true,
        peakElo: true,
        gamesPlayed: true,
        rankTier: true,
        wins: true,
        winRate: true,
        draws: true,
      },
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { OR: [{ player1Id: 'user-1' }, { player2Id: 'user-1' }] },
      select: {
        id: true,
        player1Id: true,
        player1EloAfter: true,
        player2EloAfter: true,
        finishedAt: true,
      },
      orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      take: 30,
    });
    expect(response.body.data).toMatchObject({
      currentElo: 1250,
      peakElo: 1340,
      gamesPlayed: 42,
      wins: 20,
      losses: 20,
      draws: 2,
    });
    expect(response.body.data.eloHistory).toEqual([
      { finishedAt: '2026-05-11T10:00:00.000Z', elo: 1238 },
      { finishedAt: '2026-05-12T10:00:00.000Z', elo: 1250 },
    ]);
  });

  it('includes old snapshots when they are among the latest 30 matches', async () => {
    findUnique.mockResolvedValueOnce({
      eloRating: 1210,
      peakElo: 1275,
      gamesPlayed: 8,
      rankTier: 'SILVER',
      wins: 4,
      winRate: 0.5,
      draws: 0,
    });
    findMany.mockResolvedValueOnce([
      {
        id: 'old-match',
        player1Id: 'opponent-1',
        player1EloAfter: 1190,
        player2EloAfter: 1210,
        finishedAt: new Date('2025-12-01T10:00:00.000Z'),
      },
    ]);

    const response = await getStats();

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { OR: [{ player1Id: 'user-1' }, { player2Id: 'user-1' }] },
      select: {
        id: true,
        player1Id: true,
        player1EloAfter: true,
        player2EloAfter: true,
        finishedAt: true,
      },
      orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      take: 30,
    });
    expect(response.body.data.eloHistory).toEqual([
      { finishedAt: '2025-12-01T10:00:00.000Z', elo: 1210 },
    ]);
  });
});
