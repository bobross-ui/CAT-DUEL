import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../models/prisma';
import { authMiddleware } from '../middleware/auth';
import { practiceAnswerRateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { bufferQuestionServes } from '../services/questionServeBuffer';
import { gradeAnswer } from '../services/answerGrading';
import {
  addAnswerModeIssue,
  answerPayloadShape,
  isAnswerForQuestionType,
} from '../services/answerValidation';
import type { Prisma, QuestionCategory } from '../generated/prisma/client';

const router = Router();
const SECTION_ORDER: QuestionCategory[] = ['QUANT', 'DILR', 'VARC'];
const MAX_RANDOM_SKIP = 50;

router.use(authMiddleware);

// ── GET /api/questions/next ────────────────────────────────────────────────

router.get('/next', async (req: Request, res: Response) => {
  const { categories, categoryCounts, difficulty } = req.query;

  const requestedCategories = parseCategories(categories);
  const counts = parseCategoryCounts(categoryCounts);
  const question = await findNextPracticeQuestion(
    req.user.id,
    requestedCategories.length > 0 ? requestedCategories : SECTION_ORDER,
    counts,
    difficulty ? parseInt(difficulty as string) : undefined,
  );

  if (!question) {
    res.json({ success: true, data: { noMoreQuestions: true } });
    return;
  }

  await bufferQuestionServes([question.id]);

  res.json({ success: true, data: question });
});

function parseCategories(value: unknown): QuestionCategory[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(isQuestionCategory);
}

function parseCategoryCounts(value: unknown): Partial<Record<QuestionCategory, number>> {
  const counts: Partial<Record<QuestionCategory, number>> = {};
  if (!value) return counts;

  const values = Array.isArray(value) ? value : [value];
  for (const part of values.flatMap((item) => String(item).split(','))) {
    const [category, rawCount] = part.split(':');
    if (!isQuestionCategory(category)) continue;
    counts[category] = Math.max(0, parseInt(rawCount, 10) || 0);
  }

  return counts;
}

function isQuestionCategory(value: unknown): value is QuestionCategory {
  return SECTION_ORDER.includes(value as QuestionCategory);
}

function getRoundRobinCategories(
  categories: QuestionCategory[],
  counts: Partial<Record<QuestionCategory, number>>,
): QuestionCategory[] {
  return [...categories].sort((a, b) => {
    const countDiff = (counts[a] ?? 0) - (counts[b] ?? 0);
    if (countDiff !== 0) return countDiff;
    return SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b);
  });
}

export async function findNextPracticeQuestion(
  userId: string,
  categories: QuestionCategory[],
  counts: Partial<Record<QuestionCategory, number>>,
  difficulty?: number,
) {
  const orderedCategories = getRoundRobinCategories(categories, counts);
  const unseenQuestion = await findPracticeQuestionInCategories(
    orderedCategories,
    userId,
    difficulty,
  );

  if (unseenQuestion) return unseenQuestion;

  return findPracticeQuestionInCategories(orderedCategories, undefined, difficulty);
}

async function findPracticeQuestionInCategories(
  categories: QuestionCategory[],
  userId?: string,
  difficulty?: number,
) {
  for (const category of categories) {
    const where: Prisma.QuestionWhereInput = {
      isVerified: true,
      category,
    };
    if (userId) where.practiceAnswers = { none: { userId } };
    if (difficulty) where.difficulty = difficulty;

    const randomSkip = Math.floor(Math.random() * MAX_RANDOM_SKIP);
    const question = await prisma.question.findFirst({
      where,
      select: {
        id: true,
        category: true,
        questionType: true,
        subTopic: true,
        subType: true,
        difficulty: true,
        text: true,
        options: true,
        passageId: true,
        passage: { select: { id: true, text: true } },
        // correctAnswer and explanation are intentionally excluded
      },
      orderBy: { createdAt: 'asc' },
      skip: randomSkip,
    });
    if (question) return question;

    if (randomSkip === 0) continue;

    const fallbackQuestion = await prisma.question.findFirst({
      where,
      select: {
        id: true,
        category: true,
        questionType: true,
        subTopic: true,
        subType: true,
        difficulty: true,
        text: true,
        options: true,
        passageId: true,
        passage: { select: { id: true, text: true } },
        // correctAnswer and explanation are intentionally excluded
      },
      orderBy: { createdAt: 'asc' },
    });
    if (fallbackQuestion) return fallbackQuestion;
  }

  return null;
}

// ── POST /api/questions/:id/answer ─────────────────────────────────────────

const answerSchema = z.object({
  ...answerPayloadShape,
  timeTakenMs: z.number().int().min(0),
}).strict().superRefine(addAnswerModeIssue);

router.post('/:id/answer', practiceAnswerRateLimit, validate(answerSchema), async (req: Request, res: Response) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Question not found' } });
    return;
  }

  const { selectedAnswer, typedAnswer, timeTakenMs } = req.body;
  if (!isAnswerForQuestionType(question.questionType, { selectedAnswer, typedAnswer })) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Answer shape does not match question type' },
    });
    return;
  }

  const isCorrect = gradeAnswer(question, { selectedAnswer, typedAnswer });

  await prisma.$transaction([
    prisma.practiceAnswer.create({
      data: {
        userId: req.user.id,
        questionId: question.id,
        selectedAnswer: selectedAnswer ?? null,
        typedAnswer: typedAnswer ?? null,
        isCorrect,
        timeTakenMs,
      },
    }),
    ...(isCorrect
      ? [prisma.question.update({ where: { id: question.id }, data: { timesCorrect: { increment: 1 } } })]
      : []),
  ]);

  res.json({
    success: true,
      data: {
        isCorrect,
        correctAnswer: question.correctAnswer,
        correctAnswerText: question.correctAnswerText,
        explanation: question.explanation,
        timeTakenMs,
      },
  });
});

export default router;
