export type SubmittedAnswer = {
  selectedAnswer?: number | null;
  typedAnswer?: string | null;
};

type GradableQuestion = {
  questionType: 'MCQ' | 'TITA';
  correctAnswer: number | null;
  correctAnswerText: string | null;
};

const NUMERIC_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

export function normalizeTypedAnswer(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, ' ');
  if (!NUMERIC_PATTERN.test(collapsed)) return collapsed;

  const numeric = Number(collapsed);
  if (!Number.isFinite(numeric)) return collapsed;
  if (Number.isInteger(numeric)) return String(numeric);

  return String(numeric).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function gradeAnswer(question: GradableQuestion, answer: SubmittedAnswer): boolean {
  if (question.questionType === 'MCQ') {
    return (
      typeof answer.selectedAnswer === 'number' &&
      question.correctAnswer !== null &&
      answer.selectedAnswer === question.correctAnswer
    );
  }

  if (typeof answer.typedAnswer !== 'string' || question.correctAnswerText === null) {
    return false;
  }

  return normalizeTypedAnswer(answer.typedAnswer) === normalizeTypedAnswer(question.correctAnswerText);
}
