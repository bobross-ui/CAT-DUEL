import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ActiveGamePayload } from '../navigation';
import api from '../services/api';
import { queryKeys } from './keys';

export interface MatchHistoryEntry {
  matchId: string;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  yourScore: number;
  opponentScore: number;
  yourEloChange: number;
  opponent: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    eloRating: number;
    rankTier: string;
  };
  status: string;
  durationSeconds: number;
  finishedAt: string;
}

export interface MatchHistoryData {
  entries: MatchHistoryEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MatchStats {
  currentElo: number;
  rankTier: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  peakElo: number;
  eloHistory: { finishedAt: string; elo: number }[];
}

export interface AnswerDetail {
  id: string;
  userId: string;
  questionId: string;
  selectedAnswer: number | null;
  typedAnswer: string | null;
  isCorrect: boolean;
  timeTakenMs: number;
  question: {
    id: string;
    category: string;
    questionType: 'MCQ' | 'TITA';
    subTopic: string | null;
    subType: string | null;
    text: string;
    options: string[] | null;
    correctAnswer: number | null;
    correctAnswerText: string | null;
    explanation: string;
  };
}

export interface MatchDetailData {
  id: string;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  isDraw: boolean;
  status: string;
  player1Score: number;
  player2Score: number;
  player1EloChange: number;
  player2EloChange: number;
  durationSeconds: number;
  finishedAt: string;
  player1: { id: string; displayName: string | null };
  player2: { id: string; displayName: string | null };
  answers: AnswerDetail[];
}

type UseGamesOptions = {
  enabled?: boolean;
};

export async function fetchGamesHistory(page: number, limit: number) {
  const res = await api.get('/games/history', { params: { page, limit } });
  return res.data.data as MatchHistoryData;
}

async function getGamesStats() {
  const res = await api.get('/games/stats');
  return res.data.data as MatchStats;
}

async function getGamesDetail(gameId: string) {
  const res = await api.get(`/games/${gameId}`);
  return res.data.data as MatchDetailData;
}

async function getGamesActive() {
  const res = await api.get('/games/active');
  return res.data.data as ActiveGamePayload | { gameId: null };
}

export function useGamesHistory(page: number, limit: number, options: UseGamesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.games.history(page, limit),
    queryFn: () => fetchGamesHistory(page, limit),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useGamesStats(options: UseGamesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.games.stats(),
    queryFn: getGamesStats,
    enabled: options.enabled ?? true,
  });
}

export function useGamesDetail(gameId: string, options: UseGamesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.games.detail(gameId),
    queryFn: () => getGamesDetail(gameId),
    enabled: (options.enabled ?? true) && Boolean(gameId),
  });
}

export function useGamesActive(options: UseGamesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.games.active(),
    queryFn: getGamesActive,
    enabled: options.enabled ?? true,
  });
}
