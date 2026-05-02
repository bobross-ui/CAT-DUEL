import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { queryKeys } from '../queries/keys';
import api from '../services/api';

export interface CurrentProfile {
  id: string;
  displayName: string | null;
  email?: string;
  avatarUrl?: string | null;
  eloRating: number;
  rankTier: string;
  gamesPlayed: number;
  currentStreak?: number;
  longestStreak?: number;
  ratingChangeToday?: number;
  createdAt?: string;
  wins?: number;
  winRate?: number;
  onboardingCompletedAt?: string | null;
}

async function fetchCurrentProfile() {
  const res = await api.get('/auth/me');
  return res.data.data as CurrentProfile;
}

export function useCurrentProfile() {
  const { user: authUser } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.me(),
    queryFn: fetchCurrentProfile,
    enabled: Boolean(authUser),
  });

  const refresh = useCallback(async () => {
    const result = await query.refetch();
    return result.data ?? null;
  }, [query.refetch]);

  return {
    user: authUser ? query.data ?? null : null,
    loading: authUser ? query.isLoading || (!query.data && query.isFetching) : false,
    error: query.isError ? 'Failed to load profile.' : '',
    refresh,
  };
}
