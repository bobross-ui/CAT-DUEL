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

export interface PracticeSummary {
  total: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  totalTimeMs: number;
  avgTimePerQuestionMs: number;
}

export const questionService = {
  getNext: (filters: { category?: string; difficulty?: number }) =>
    api.get<{ success: boolean; data: Question | { noMoreQuestions: boolean } }>(
      '/questions/next',
      { params: filters }
    ),

  submitAnswer: (questionId: string, selectedAnswer: number, timeTakenMs: number) =>
    api.post<{ success: boolean; data: AnswerResult }>(
      `/questions/${questionId}/answer`,
      { selectedAnswer, timeTakenMs }
    ),

  getSummary: () =>
    api.get<{ success: boolean; data: PracticeSummary }>('/questions/practice/summary'),
};
