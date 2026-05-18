import { z } from 'zod';
import { addAnswerModeIssue, answerPayloadShape } from './answerValidation';

const MAX_REPORTED_ANSWER_TIME_MS = 60 * 60 * 1000;

export const socketGameIdPayloadSchema = z.object({
  gameId: z.string().uuid(),
}).strict();

export const socketAnswerSubmitPayloadSchema = z.object({
  gameId: z.string().uuid(),
  questionId: z.string().uuid(),
  ...answerPayloadShape,
  timeTakenMs: z.number().int().min(0).max(MAX_REPORTED_ANSWER_TIME_MS).optional(),
}).strict().superRefine(addAnswerModeIssue);

export const socketQuestionSkipPayloadSchema = z.object({
  gameId: z.string().uuid(),
  questionId: z.string().uuid(),
}).strict();

export const socketQuestionJumpPayloadSchema = z.object({
  gameId: z.string().uuid(),
  questionId: z.string().uuid(),
}).strict();
