import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { queryKeys } from './keys';

export type RankTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

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

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  currentUserRank: number | null;
  totalRanked: number;
  tierCounts?: Record<RankTier, number>;
}

type UseLeaderboardOptions = {
  enabled?: boolean;
};

async function getLeaderboardGlobal() {
  const res = await api.get('/leaderboard/global');
  return res.data.data as LeaderboardData;
}

async function getLeaderboardAroundMe() {
  const res = await api.get('/leaderboard/around-me');
  return res.data.data as LeaderboardData;
}

async function getLeaderboardTier(tier: RankTier) {
  const res = await api.get(`/leaderboard/tier/${tier}`);
  return res.data.data as LeaderboardData;
}

export function useLeaderboardGlobal(options: UseLeaderboardOptions = {}) {
  return useQuery({
    queryKey: queryKeys.leaderboard.global(),
    queryFn: getLeaderboardGlobal,
    enabled: options.enabled ?? true,
  });
}

export function useLeaderboardAroundMe(options: UseLeaderboardOptions = {}) {
  return useQuery({
    queryKey: queryKeys.leaderboard.aroundMe(),
    queryFn: getLeaderboardAroundMe,
    enabled: options.enabled ?? true,
  });
}

export function useLeaderboardTier(tier: RankTier, options: UseLeaderboardOptions = {}) {
  return useQuery({
    queryKey: queryKeys.leaderboard.tier(tier),
    queryFn: () => getLeaderboardTier(tier),
    enabled: (options.enabled ?? true) && Boolean(tier),
  });
}
