import api from './api';

export const leaderboardService = {
  getGlobal: () => api.get('/leaderboard/global'),
  getTier: (tier: string) => api.get(`/leaderboard/tier/${tier}`),
};
