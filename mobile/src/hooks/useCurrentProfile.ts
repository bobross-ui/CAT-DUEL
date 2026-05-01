import { useCallback, useEffect, useState } from 'react';
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

let cachedProfile: CurrentProfile | null = null;
let inflight: Promise<CurrentProfile> | null = null;

export async function fetchCurrentProfile() {
  if (!inflight) {
    inflight = api.get('/auth/me')
      .then((res) => {
        cachedProfile = res.data.data as CurrentProfile;
        return cachedProfile;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

export function clearCurrentProfileCache() {
  cachedProfile = null;
  inflight = null;
}

export function useCurrentProfile() {
  const [user, setUser] = useState<CurrentProfile | null>(cachedProfile);
  const [loading, setLoading] = useState(!cachedProfile);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(!cachedProfile);
    setError('');
    try {
      const nextProfile = await fetchCurrentProfile();
      setUser(nextProfile);
      return nextProfile;
    } catch {
      setError('Failed to load profile.');
      setUser(cachedProfile);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { user, loading, error, refresh };
}
