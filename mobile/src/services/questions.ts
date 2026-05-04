import api from './api';

export interface Question {
  id: string;
  category: 'QUANT' | 'DILR' | 'VARC';
  questionType: 'MCQ' | 'TITA';
  subTopic: string | null;
  subType: string | null;
  difficulty: number;
  text: string;
  options: string[] | null;
}

export interface AnswerResult {
  isCorrect: boolean;
  correctAnswer: number | null;
  correctAnswerText: string | null;
  explanation: string;
  timeTakenMs: number;
}

export type SubmitAnswerPayload =
  | { selectedAnswer: number; timeTakenMs: number }
  | { typedAnswer: string; timeTakenMs: number };

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

  submitAnswer: (questionId: string, answer: SubmitAnswerPayload) =>
    api.post<{ success: boolean; data: AnswerResult }>(
      `/questions/${questionId}/answer`,
      answer
    ),
};

function formatCategoryCounts(counts: Record<string, number> | undefined): string | undefined {
  if (!counts) return undefined;
  return Object.entries(counts)
    .map(([category, count]) => `${category}:${count}`)
    .join(',');
}
