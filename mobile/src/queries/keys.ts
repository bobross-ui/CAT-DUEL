export const queryKeys = {
  me: () => ['me'] as const,
  user: (userId: string) => ['user', userId] as const,
  games: {
    all: () => ['games'] as const,
    history: (page: number, limit: number) => ['games', 'history', { page, limit }] as const,
    stats: () => ['games', 'stats'] as const,
    detail: (gameId: string) => ['games', 'detail', gameId] as const,
    active: () => ['games', 'active'] as const,
  },
  leaderboard: {
    all: () => ['leaderboard'] as const,
    global: () => ['leaderboard', 'global'] as const,
    aroundMe: () => ['leaderboard', 'around-me'] as const,
    tier: (tier: string) => ['leaderboard', 'tier', tier] as const,
  },
};
