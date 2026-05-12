import { z } from 'zod';

export const MAX_TYPED_ANSWER_LENGTH = 128;

type AnswerModeIssue = {
  code: 'custom';
  path: ('selectedAnswer' | 'typedAnswer')[];
  message: string;
};

type SubmittedAnswerLike = {
  selectedAnswer?: number | null;
  typedAnswer?: string | null;
};

const selectedAnswerSchema = z.number().int().min(0).max(3);

const typedAnswerSchema = z.string()
  .min(1, 'typedAnswer is required')
  .max(
    MAX_TYPED_ANSWER_LENGTH,
    `typedAnswer must be at most ${MAX_TYPED_ANSWER_LENGTH} characters`,
  )
  .refine((value) => value.trim().length > 0, {
    message: 'typedAnswer is required',
  })
  .transform((value) => value.trim());

export const answerPayloadShape = {
  selectedAnswer: selectedAnswerSchema.optional(),
  typedAnswer: typedAnswerSchema.optional(),
};

function getAnswerModeIssue(answer: SubmittedAnswerLike): AnswerModeIssue | null {
  const hasSelectedAnswer = answer.selectedAnswer !== undefined && answer.selectedAnswer !== null;
  const hasTypedAnswer = answer.typedAnswer !== undefined && answer.typedAnswer !== null;

  if (hasSelectedAnswer && hasTypedAnswer) {
    return {
      code: 'custom',
      path: ['typedAnswer'],
      message: 'Submit either selectedAnswer or typedAnswer, not both',
    };
  }

  if (!hasSelectedAnswer && !hasTypedAnswer) {
    return {
      code: 'custom',
      path: ['selectedAnswer'],
      message: 'selectedAnswer or typedAnswer is required',
    };
  }

  return null;
}

export function addAnswerModeIssue(
  answer: SubmittedAnswerLike,
  ctx: { addIssue(issue: AnswerModeIssue): void },
): void {
  const issue = getAnswerModeIssue(answer);
  if (issue) ctx.addIssue(issue);
}

export function isAnswerForQuestionType(
  questionType: 'MCQ' | 'TITA',
  answer: SubmittedAnswerLike,
): boolean {
  const hasSelectedAnswer = answer.selectedAnswer !== undefined && answer.selectedAnswer !== null;
  const hasTypedAnswer = answer.typedAnswer !== undefined && answer.typedAnswer !== null;

  if (hasSelectedAnswer === hasTypedAnswer) return false;
  return questionType === 'MCQ' ? hasSelectedAnswer : hasTypedAnswer;
}
