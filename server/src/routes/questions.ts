import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../models/prisma';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);

// ── GET /api/questions/next ────────────────────────────────────────────────

router.get('/next', async (req: Request, res: Response) => {
  const { category, difficulty } = req.query;

  const where: Record<string, unknown> = { isVerified: true };
  if (category) where.category = category;
  if (difficulty) where.difficulty = parseInt(difficulty as string);

  // Exclude questions this user has already answered
  const answered = await prisma.practiceAnswer.findMany({
    where: { userId: req.user.id },
    select: { questionId: true },
  });
  const seenIds = answered.map((a) => a.questionId);
  if (seenIds.length > 0) where.id = { notIn: seenIds };

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
    orderBy: { timesServed: 'asc' },
  });

  if (!question) {
    res.json({ success: true, data: { noMoreQuestions: true } });
    return;
  }

  await prisma.question.update({
    where: { id: question.id },
    data: { timesServed: { increment: 1 } },
  });

  res.json({ success: true, data: question });
});

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
