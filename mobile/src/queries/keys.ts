export const queryKeys = {
  me: (firebaseUid?: string | null) => (firebaseUid ? ['me', firebaseUid] as const : ['me'] as const),
  user: (userId: string) => ['user', userId] as const,
  games: {
    all: () => ['games'] as const,
    history: (scopeId: string | null, limit: number, cursor: string | null = null) => ['games', 'history', scopeId, { cursor, limit }] as const,
    stats: (userId: string | null = null) => ['games', 'stats', userId] as const,
    detail: (gameId: string) => ['games', 'detail', gameId] as const,
    active: (scopeId: string | null = null) => ['games', 'active', scopeId] as const,
  },
  leaderboard: {
    all: () => ['leaderboard'] as const,
    global: () => ['leaderboard', 'global'] as const,
    aroundMe: () => ['leaderboard', 'around-me'] as const,
    tier: (tier: string) => ['leaderboard', 'tier', tier] as const,
  },
};
