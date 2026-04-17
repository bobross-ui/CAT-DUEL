import api from './api';

export const leaderboardService = {
  getGlobal: () => api.get('/leaderboard/global'),
  getAroundMe: () => api.get('/leaderboard/around-me'),
  getTier: (tier: string) => api.get(`/leaderboard/tier/${tier}`),
};
