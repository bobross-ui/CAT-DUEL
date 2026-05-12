import { MAX_TYPED_ANSWER_LENGTH, isAnswerForQuestionType } from '../answerValidation';
import {
  socketAnswerSubmitPayloadSchema,
  socketGameIdPayloadSchema,
} from '../socketPayloadSchemas';

const gameId = '00000000-0000-4000-8000-000000000001';
const questionId = '00000000-0000-4000-8000-000000000002';

describe('socket answer validation', () => {
  it('accepts an MCQ answer with valid UUIDs and selected option', () => {
    const result = socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      selectedAnswer: 2,
      timeTakenMs: 1234,
    });

    expect(result.success).toBe(true);
  });

  it('trims typed answers and caps their stored length', () => {
    const result = socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      typedAnswer: '  42  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.typedAnswer).toBe('42');
    }

    expect(socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      typedAnswer: 'x'.repeat(MAX_TYPED_ANSWER_LENGTH + 1),
    }).success).toBe(false);
  });

  it('accepts typed answers at the max length boundary and rejects whitespace-only input', () => {
    expect(socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      typedAnswer: 'x'.repeat(MAX_TYPED_ANSWER_LENGTH),
    }).success).toBe(true);

    expect(socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      typedAnswer: '   ',
    }).success).toBe(false);
  });

  it('rejects malformed IDs and invalid selected-answer indexes', () => {
    expect(socketGameIdPayloadSchema.safeParse({ gameId: 'not-a-uuid' }).success).toBe(false);
    expect(socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      selectedAnswer: 4,
    }).success).toBe(false);
    expect(socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      selectedAnswer: 1.5,
    }).success).toBe(false);
  });

  it('rejects extra keys and out-of-range reported answer times', () => {
    expect(socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      selectedAnswer: 1,
      unexpected: true,
    }).success).toBe(false);

    expect(socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      selectedAnswer: 1,
      timeTakenMs: -1,
    }).success).toBe(false);

    expect(socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      selectedAnswer: 1,
      timeTakenMs: 60 * 60 * 1000 + 1,
    }).success).toBe(false);
  });

  it('requires exactly one answer mode', () => {
    expect(socketAnswerSubmitPayloadSchema.safeParse({ gameId, questionId }).success).toBe(false);
    expect(socketAnswerSubmitPayloadSchema.safeParse({
      gameId,
      questionId,
      selectedAnswer: 1,
      typedAnswer: '1',
    }).success).toBe(false);
  });

  it('matches answer mode to question type', () => {
    expect(isAnswerForQuestionType('MCQ', { selectedAnswer: 0, typedAnswer: null })).toBe(true);
    expect(isAnswerForQuestionType('MCQ', { selectedAnswer: null, typedAnswer: '0' })).toBe(false);
    expect(isAnswerForQuestionType('TITA', { selectedAnswer: null, typedAnswer: '0' })).toBe(true);
    expect(isAnswerForQuestionType('TITA', { selectedAnswer: 0, typedAnswer: null })).toBe(false);
  });
});
