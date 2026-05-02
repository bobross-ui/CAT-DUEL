import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../models/prisma';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { bufferQuestionServes } from '../services/questionServeBuffer';

const router = Router();
const SECTION_ORDER = ['QUANT', 'DILR', 'VARC'];
const MAX_RANDOM_SKIP = 50;

router.use(authMiddleware);

// ── GET /api/questions/next ────────────────────────────────────────────────

router.get('/next', async (req: Request, res: Response) => {
  const { categories, categoryCounts, difficulty } = req.query;

  const requestedCategories = parseCategories(categories);
  const counts = parseCategoryCounts(categoryCounts);
  const question = await findNextPracticeQuestion(
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

function parseCategories(value: unknown): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter((item) => SECTION_ORDER.includes(item));
}

function parseCategoryCounts(value: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!value) return counts;

  const values = Array.isArray(value) ? value : [value];
  for (const part of values.flatMap((item) => String(item).split(','))) {
    const [category, rawCount] = part.split(':');
    if (!category || !SECTION_ORDER.includes(category)) continue;
    counts[category] = Math.max(0, parseInt(rawCount, 10) || 0);
  }

  return counts;
}

function getRoundRobinCategories(categories: string[], counts: Record<string, number>): string[] {
  return [...categories].sort((a, b) => {
    const countDiff = (counts[a] ?? 0) - (counts[b] ?? 0);
    if (countDiff !== 0) return countDiff;
    return SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b);
  });
}

async function findNextPracticeQuestion(
  categories: string[],
  counts: Record<string, number>,
  difficulty?: number,
) {
  for (const category of getRoundRobinCategories(categories, counts)) {
    const where: Record<string, unknown> = { isVerified: true, category };
    if (difficulty) where.difficulty = difficulty;

    const randomSkip = Math.floor(Math.random() * MAX_RANDOM_SKIP);
    const question = await prisma.question.findFirst({
      where,
      select: {
        id: true,
        category: true,
        subTopic: true,
        difficulty: true,
        text: true,
        options: true,
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
        subTopic: true,
        difficulty: true,
        text: true,
        options: true,
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
  selectedAnswer: z.number().int().min(0).max(3),
  timeTakenMs: z.number().int().min(0),
});

router.post('/:id/answer', validate(answerSchema), async (req: Request, res: Response) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Question not found' } });
    return;
  }

  const { selectedAnswer, timeTakenMs } = req.body;
  const isCorrect = question.correctAnswer === selectedAnswer;

  await prisma.practiceAnswer.create({
    data: {
      userId: req.user.id,
      questionId: question.id,
      selectedAnswer,
      isCorrect,
      timeTakenMs,
    },
  });

  if (isCorrect) {
    await prisma.question.update({
      where: { id: question.id },
      data: { timesCorrect: { increment: 1 } },
    });
  }

  res.json({
    success: true,
    data: {
      isCorrect,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      timeTakenMs,
    },
  });
});

export default router;
