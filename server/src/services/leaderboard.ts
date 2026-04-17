import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import { RankTier } from './elo';

const MIN_GAMES_TO_RANK = 5;
const GLOBAL_CACHE_KEY = 'leaderboard:global:top100';
const GLOBAL_CACHE_TTL = 60; // seconds

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  eloRating: number;
  rankTier: RankTier;
  gamesPlayed: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  currentUserRank: number | null;
  totalRanked: number;
}

export async function getUserGlobalRank(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { eloRating: true, gamesPlayed: true, createdAt: true },
  });

  if (!user || user.gamesPlayed < MIN_GAMES_TO_RANK) return null;

  const higherCount = await prisma.user.count({
    where: {
      gamesPlayed: { gte: MIN_GAMES_TO_RANK },
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

  return higherCount + 1;
}

export async function getGlobalLeaderboard(currentUserId: string): Promise<LeaderboardResponse> {
  const cached = await redis.get(GLOBAL_CACHE_KEY);
  let top100: LeaderboardEntry[];

  if (cached) {
    top100 = JSON.parse(cached);
  } else {
    const rows = await prisma.user.findMany({
      where: { gamesPlayed: { gte: MIN_GAMES_TO_RANK } },
      orderBy: [{ eloRating: 'desc' }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true, displayName: true, avatarUrl: true,
        eloRating: true, rankTier: true, gamesPlayed: true,
      },
    });

    top100 = rows.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      displayName: u.displayName ?? 'Anonymous',
      avatarUrl: u.avatarUrl,
      eloRating: u.eloRating,
      rankTier: u.rankTier as RankTier,
      gamesPlayed: u.gamesPlayed,
      isCurrentUser: false,
    }));

    await redis.set(GLOBAL_CACHE_KEY, JSON.stringify(top100), 'EX', GLOBAL_CACHE_TTL);
  }

  const withFlag = top100.map(e => ({ ...e, isCurrentUser: e.userId === currentUserId }));

  const [currentUserRank, totalRanked] = await Promise.all([
    getUserGlobalRank(currentUserId),
    prisma.user.count({ where: { gamesPlayed: { gte: MIN_GAMES_TO_RANK } } }),
  ]);

  return { entries: withFlag, currentUserRank, totalRanked };
}

export async function getAroundMeLeaderboard(userId: string): Promise<LeaderboardResponse> {
  const userRank = await getUserGlobalRank(userId);

  if (userRank == null) {
    const response = await getGlobalLeaderboard(userId);
    return { ...response, entries: response.entries.slice(0, 10) };
  }

  const startRank = Math.max(1, userRank - 5);
  const skip = startRank - 1;

  const rows = await prisma.user.findMany({
    where: { gamesPlayed: { gte: MIN_GAMES_TO_RANK } },
    orderBy: [{ eloRating: 'desc' }, { createdAt: 'asc' }],
    skip,
    take: 10,
    select: {
      id: true, displayName: true, avatarUrl: true,
      eloRating: true, rankTier: true, gamesPlayed: true,
    },
  });

  const entries = rows.map((u, i) => ({
    rank: startRank + i,
    userId: u.id,
    displayName: u.displayName ?? 'Anonymous',
    avatarUrl: u.avatarUrl,
    eloRating: u.eloRating,
    rankTier: u.rankTier as RankTier,
    gamesPlayed: u.gamesPlayed,
    isCurrentUser: u.id === userId,
  }));

  const totalRanked = await prisma.user.count({ where: { gamesPlayed: { gte: MIN_GAMES_TO_RANK } } });
  return { entries, currentUserRank: userRank, totalRanked };
}

export async function getTierLeaderboard(tier: RankTier, userId: string): Promise<LeaderboardResponse> {
  const cacheKey = `leaderboard:tier:${tier}:top100`;
  let entries: LeaderboardEntry[];

  const cached = await redis.get(cacheKey);
  if (cached) {
    entries = JSON.parse(cached);
  } else {
    const rows = await prisma.user.findMany({
      where: { rankTier: tier, gamesPlayed: { gte: MIN_GAMES_TO_RANK } },
      orderBy: [{ eloRating: 'desc' }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true, displayName: true, avatarUrl: true,
        eloRating: true, rankTier: true, gamesPlayed: true,
      },
    });

    entries = rows.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      displayName: u.displayName ?? 'Anonymous',
      avatarUrl: u.avatarUrl,
      eloRating: u.eloRating,
      rankTier: u.rankTier as RankTier,
      gamesPlayed: u.gamesPlayed,
      isCurrentUser: false,
    }));

    await redis.set(cacheKey, JSON.stringify(entries), 'EX', 120);
  }

  const withFlag = entries.map(e => ({ ...e, isCurrentUser: e.userId === userId }));

  const totalRanked = await prisma.user.count({
    where: { rankTier: tier, gamesPlayed: { gte: MIN_GAMES_TO_RANK } },
  });

  // Rank within this tier only
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { eloRating: true, gamesPlayed: true, createdAt: true, rankTier: true },
  });

  let currentUserRank: number | null = null;
  if (user && user.rankTier === tier && user.gamesPlayed >= MIN_GAMES_TO_RANK) {
    const higherInTier = await prisma.user.count({
      where: {
        rankTier: tier,
        gamesPlayed: { gte: MIN_GAMES_TO_RANK },
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
