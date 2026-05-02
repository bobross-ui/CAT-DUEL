import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CurrentProfile } from '../hooks/useCurrentProfile';
import api from '../services/api';
import { queryKeys } from './keys';

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
