import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
}

let cachedProfile: CurrentProfile | null = null;
let inflight: Promise<CurrentProfile> | null = null;

async function fetchProfile() {
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
}

export function useCurrentProfile() {
  const [user, setUser] = useState<CurrentProfile | null>(cachedProfile);
  const [loading, setLoading] = useState(!cachedProfile);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(!cachedProfile);
    setError('');
    try {
      const nextProfile = await fetchProfile();
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

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { user, loading, error, refresh };
}
