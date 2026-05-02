import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CurrentProfile } from '../hooks/useCurrentProfile';
import api from '../services/api';
import { queryKeys } from './keys';

export interface PublicUserProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  eloRating: number;
  gamesPlayed: number;
  createdAt: string;
}

interface UpdateMeInput {
  displayName?: string;
  avatarUrl?: string;
}

interface CompleteOnboardingInput {
  onboardingCompletedAt: string;
}

async function updateMe(input: UpdateMeInput) {
  const res = await api.patch('/users/me', input);
  return res.data.data as CurrentProfile;
}

async function completeOnboarding(input: CompleteOnboardingInput) {
  const res = await api.patch('/users/me', input);
  return res.data.data as CurrentProfile;
}

async function deleteMe() {
  await api.delete('/users/me');
}

async function getUserProfile(userId: string) {
  const res = await api.get(`/users/${userId}`);
  return res.data.data as PublicUserProfile;
}

export function useUserProfile(userId: string) {
  return useQuery({
    queryKey: queryKeys.user(userId),
    queryFn: () => getUserProfile(userId),
    enabled: Boolean(userId),
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateMe,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.me(), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completeOnboarding,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.me(), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}

export function useDeleteMe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMe,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
