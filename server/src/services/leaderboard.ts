import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import type { User } from '../generated/prisma/client';
import { RankTier } from './elo';
import { publicDisplayName } from './displayName';
import { logger } from '../lib/logger';

const MIN_GAMES_TO_RANK = 5;
const GLOBAL_CACHE_KEY = 'leaderboard:global:v2:top100';
const GLOBAL_CACHE_TTL = 60; // seconds
const USER_GLOBAL_RANK_CACHE_TTL = 60; // seconds
const RANK_TIERS: RankTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  eloRating: number;
  rankTier: RankTier;
  gamesPlayed: number;
  winRate: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  currentUserRank: number | null;
  totalRanked: number;
  tierCounts?: Record<RankTier, number>;
}

interface CachedGlobalLeaderboard {
  top100: LeaderboardEntry[];
  tierCounts: Record<RankTier, number>;
}

function userGlobalRankCacheKey(userId: string): string {
  return `user:rank:global:${userId}`;
}

export async function getUserGlobalRank(userId: string): Promise<number | null> {
  const cacheKey = userGlobalRankCacheKey(userId);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as number | null;
  } catch (err) {
    logger.error({ err }, 'leaderboard: global rank cache read failed');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { eloRating: true, gamesPlayed: true, createdAt: true, deletedAt: true },
  });

  if (!user || user.deletedAt || user.gamesPlayed < MIN_GAMES_TO_RANK) {
    try {
      await redis.set(cacheKey, JSON.stringify(null), 'EX', USER_GLOBAL_RANK_CACHE_TTL);
    } catch (err) {
      logger.error({ err }, 'leaderboard: global rank cache write failed');
    }
    return null;
  }

  const higherCount = await prisma.user.count({
    where: {
      gamesPlayed: { gte: MIN_GAMES_TO_RANK },
      deletedAt: null,
      OR: [
        { eloRating: { gt: user.eloRating } },
        {
          AND: [
            { eloRating: user.eloRating },
            { createdAt: { lt: user.createdAt } },
          ],
        },
      ],
    },
  });

  const rank = higherCount + 1;
  try {
    await redis.set(cacheKey, JSON.stringify(rank), 'EX', USER_GLOBAL_RANK_CACHE_TTL);
  } catch (err) {
    logger.error({ err }, 'leaderboard: global rank cache write failed');
  }

  return rank;
}

export async function invalidateUserGlobalRank(userId: string): Promise<void> {
  try {
    await redis.del(userGlobalRankCacheKey(userId));
  } catch (err) {
    logger.error({ err }, 'leaderboard: global rank cache invalidate failed');
  }
}

export async function invalidateLeaderboardCaches(userId: string): Promise<void> {
  try {
    await redis.del(
      GLOBAL_CACHE_KEY,
      userGlobalRankCacheKey(userId),
      ...RANK_TIERS.map((tier) => `leaderboard:tier:${tier}:v2:top100`),
    );
  } catch (err) {
    logger.error({ err }, 'leaderboard: cache invalidate failed');
  }
}

export async function getGlobalLeaderboard(currentUserId: string): Promise<LeaderboardResponse> {
  const cached = await redis.get(GLOBAL_CACHE_KEY);
  let top100: LeaderboardEntry[];
  let tierCounts: Record<RankTier, number>;

  if (cached) {
    const parsed = JSON.parse(cached) as LeaderboardEntry[] | CachedGlobalLeaderboard;
    if (Array.isArray(parsed)) {
      top100 = parsed;
      tierCounts = await getTierCounts();
    } else {
      top100 = parsed.top100;
      tierCounts = parsed.tierCounts;
    }
  } else {
    const [rows, counts] = await Promise.all([
      prisma.user.findMany({
        where: { gamesPlayed: { gte: MIN_GAMES_TO_RANK }, deletedAt: null },
        orderBy: [{ eloRating: 'desc' }, { createdAt: 'asc' }],
        take: 100,
        select: {
          id: true, displayName: true, avatarUrl: true, deletedAt: true,
          eloRating: true, rankTier: true, gamesPlayed: true, winRate: true,
        },
      }),
      getTierCounts(),
    ]);

    top100 = rows.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      displayName: publicDisplayName(u),
      avatarUrl: u.avatarUrl,
      eloRating: u.eloRating,
      rankTier: u.rankTier as RankTier,
      gamesPlayed: u.gamesPlayed,
      winRate: u.winRate,
      isCurrentUser: false,
    }));
    tierCounts = counts;

    await redis.set(
      GLOBAL_CACHE_KEY,
      JSON.stringify({ top100, tierCounts }),
      'EX',
      GLOBAL_CACHE_TTL,
    );
  }

  const withFlag = top100.map(e => ({ ...e, isCurrentUser: e.userId === currentUserId }));

  const [currentUserRank, totalRanked] = await Promise.all([
    getUserGlobalRank(currentUserId),
    prisma.user.count({ where: { gamesPlayed: { gte: MIN_GAMES_TO_RANK }, deletedAt: null } }),
  ]);

  return { entries: withFlag, currentUserRank, totalRanked, tierCounts };
}

export async function getAroundMeLeaderboard(userId: string): Promise<LeaderboardResponse> {
  const [userRank, currentUser] = await Promise.all([
    getUserGlobalRank(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { eloRating: true, createdAt: true } }),
  ]);

  if (userRank == null || !currentUser) {
    const response = await getGlobalLeaderboard(userId);
    return { ...response, entries: response.entries.slice(0, 10) };
  }

  const baseWhere = { gamesPlayed: { gte: MIN_GAMES_TO_RANK }, deletedAt: null };
  const userSelect = {
    id: true, displayName: true, avatarUrl: true, deletedAt: true,
    eloRating: true, rankTier: true, gamesPlayed: true, winRate: true,
  };

  const [above, atOrBelow, totalRanked] = await Promise.all([
    // 5 closest users ranked above: highest ELO of this group comes last (ASC), so take:5 gives the nearest 5
    prisma.user.findMany({
      where: {
        ...baseWhere,
        OR: [
          { eloRating: { gt: currentUser.eloRating } },
          { AND: [{ eloRating: currentUser.eloRating }, { createdAt: { lt: currentUser.createdAt } }] },
        ],
      },
      orderBy: [{ eloRating: 'asc' }, { createdAt: 'desc' }],
      take: 5,
      select: userSelect,
    }),
    // current user + up to 4 below, in leaderboard order
    prisma.user.findMany({
      where: {
        ...baseWhere,
        OR: [
          { eloRating: { lt: currentUser.eloRating } },
          { AND: [{ eloRating: currentUser.eloRating }, { createdAt: { gte: currentUser.createdAt } }] },
        ],
      },
      orderBy: [{ eloRating: 'desc' }, { createdAt: 'asc' }],
      take: 5,
      select: userSelect,
    }),
    prisma.user.count({ where: { gamesPlayed: { gte: MIN_GAMES_TO_RANK }, deletedAt: null } }),
  ]);

  // above is ordered closest-first (ASC elo); reverse to get top-to-bottom order
  const rows = [...above.reverse(), ...atOrBelow];
  const startRank = userRank - above.length;

  const entries = rows.map((u, i) => ({
    rank: startRank + i,
    userId: u.id,
    displayName: publicDisplayName(u),
    avatarUrl: u.avatarUrl,
    eloRating: u.eloRating,
    rankTier: u.rankTier as RankTier,
    gamesPlayed: u.gamesPlayed,
    winRate: u.winRate,
    isCurrentUser: u.id === userId,
  }));

  return { entries, currentUserRank: userRank, totalRanked };
}

export async function getTierLeaderboard(tier: RankTier, user: User): Promise<LeaderboardResponse> {
  const cacheKey = `leaderboard:tier:${tier}:v2:top100`;
  let entries: LeaderboardEntry[];

  const cached = await redis.get(cacheKey);
  if (cached) {
    entries = JSON.parse(cached);
  } else {
    const rows = await prisma.user.findMany({
      where: { rankTier: tier, gamesPlayed: { gte: MIN_GAMES_TO_RANK }, deletedAt: null },
      orderBy: [{ eloRating: 'desc' }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true, displayName: true, avatarUrl: true, deletedAt: true,
        eloRating: true, rankTier: true, gamesPlayed: true, winRate: true,
      },
    });

    entries = rows.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      displayName: publicDisplayName(u),
      avatarUrl: u.avatarUrl,
      eloRating: u.eloRating,
      rankTier: u.rankTier as RankTier,
      gamesPlayed: u.gamesPlayed,
      winRate: u.winRate,
      isCurrentUser: false,
    }));

    await redis.set(cacheKey, JSON.stringify(entries), 'EX', 120);
  }

  const withFlag = entries.map(e => ({ ...e, isCurrentUser: e.userId === user.id }));

  const totalRanked = await prisma.user.count({
    where: { rankTier: tier, gamesPlayed: { gte: MIN_GAMES_TO_RANK }, deletedAt: null },
  });

  let currentUserRank: number | null = null;
  if (user.rankTier === tier && user.gamesPlayed >= MIN_GAMES_TO_RANK) {
    const higherInTier = await prisma.user.count({
      where: {
        rankTier: tier,
        gamesPlayed: { gte: MIN_GAMES_TO_RANK },
        deletedAt: null,
        OR: [
          { eloRating: { gt: user.eloRating } },
          { AND: [{ eloRating: user.eloRating }, { createdAt: { lt: user.createdAt } }] },
        ],
      },
    });
    currentUserRank = higherInTier + 1;
  }

  return { entries: withFlag, currentUserRank, totalRanked };
}

const TIER_COUNTS_CACHE_KEY = 'leaderboard:tier_counts';
const TIER_COUNTS_CACHE_TTL = 60; // seconds

async function getTierCounts(): Promise<Record<RankTier, number>> {
  const cached = await redis.get(TIER_COUNTS_CACHE_KEY);
  if (cached) return JSON.parse(cached) as Record<RankTier, number>;

  const counts = Object.fromEntries(RANK_TIERS.map((tier) => [tier, 0])) as Record<RankTier, number>;
  const rows = await prisma.user.groupBy({
    by: ['rankTier'],
    where: { gamesPlayed: { gte: MIN_GAMES_TO_RANK }, deletedAt: null },
    _count: { _all: true },
  });

  for (const row of rows) {
    counts[row.rankTier as RankTier] = row._count._all;
  }

  await redis.set(TIER_COUNTS_CACHE_KEY, JSON.stringify(counts), 'EX', TIER_COUNTS_CACHE_TTL);
  return counts;
}
