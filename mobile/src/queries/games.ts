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
    cursor: string | null;
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
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
    explanationImages: string[];
    passage: { id: string; text: string; images: string[] } | null;
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
  player1EloAfter: number;
  player2EloAfter: number;
  player1Answered: number;
  player2Answered: number;
  totalQuestions: number;
  durationSeconds: number;
  finishedAt: string;
  player1: { id: string; displayName: string | null; displayCode?: string | null; avatarUrl: string | null; eloRating: number };
  player2: { id: string; displayName: string | null; displayCode?: string | null; avatarUrl: string | null; eloRating: number };
  answers: AnswerDetail[];
}

type UseGamesOptions = {
  enabled?: boolean;
};

export async function fetchGamesHistory(limit: number, cursor: string | null = null) {
  const res = await api.get('/games/history', { params: { cursor, limit } });
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

export function useGamesHistory(limit: number, cursor: string | null = null, options: UseGamesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.games.history(limit, cursor),
    queryFn: () => fetchGamesHistory(limit, cursor),
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
