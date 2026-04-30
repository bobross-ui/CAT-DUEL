import api from './api';

export interface Question {
  id: string;
  category: 'QUANT' | 'DILR' | 'VARC';
  subTopic: string | null;
  difficulty: number;
  text: string;
  options: string[];
}

export interface AnswerResult {
  isCorrect: boolean;
  correctAnswer: number;
  explanation: string;
  timeTakenMs: number;
}

export const questionService = {
  getNext: (filters: { categories: string[]; categoryCounts?: Record<string, number>; difficulty?: number }) =>
    api.get<{ success: boolean; data: Question | { noMoreQuestions: boolean } }>(
      '/questions/next',
      {
        params: {
          ...filters,
          categories: filters.categories.join(','),
          categoryCounts: formatCategoryCounts(filters.categoryCounts),
        },
      }
    ),

  submitAnswer: (questionId: string, selectedAnswer: number, timeTakenMs: number) =>
    api.post<{ success: boolean; data: AnswerResult }>(
      `/questions/${questionId}/answer`,
      { selectedAnswer, timeTakenMs }
    ),
};

function formatCategoryCounts(counts: Record<string, number> | undefined): string | undefined {
  if (!counts) return undefined;
  return Object.entries(counts)
    .map(([category, count]) => `${category}:${count}`)
    .join(',');
}
