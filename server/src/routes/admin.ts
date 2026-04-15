import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { prisma } from '../models/prisma';
import { authMiddleware } from '../middleware/auth';
import { adminOnly } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { generateQuestions } from '../services/questionGenerator';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// All admin routes require auth + admin role
router.use(authMiddleware, adminOnly);

// ── Zod schemas ────────────────────────────────────────────────────────────

const createQuestionSchema = z.object({
  category: z.enum(['QUANT', 'DILR', 'VARC']),
  subTopic: z.string().optional(),
  difficulty: z.number().int().min(1).max(5),
  text: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctAnswer: z.number().int().min(0).max(3),
  explanation: z.string().min(10),
});

const updateQuestionSchema = createQuestionSchema.partial();

// ── POST /api/admin/questions ──────────────────────────────────────────────

router.post('/questions', validate(createQuestionSchema), async (req: Request, res: Response) => {
  const question = await prisma.question.create({
    data: { ...req.body, source: 'MANUAL' },
  });
  res.status(201).json({ success: true, data: question });
});

// ── GET /api/admin/questions/stats ─────────────────────────────────────────
// Must be defined before /:id to avoid route conflict

router.get('/questions/stats', async (_req: Request, res: Response) => {
  const [total, verified, byCategory] = await Promise.all([
    prisma.question.count(),
    prisma.question.count({ where: { isVerified: true } }),
    prisma.question.groupBy({ by: ['category'], _count: { id: true } }),
  ]);

  const byCategoryMap = Object.fromEntries(
    byCategory.map((r) => [r.category, r._count.id])
  );

  res.json({ success: true, data: { total, verified, unverified: total - verified, byCategory: byCategoryMap } });
});

// ── GET /api/admin/questions ───────────────────────────────────────────────

router.get('/questions', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { category, difficulty, verified } = req.query;

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (difficulty) where.difficulty = parseInt(difficulty as string);
  if (verified !== undefined) where.isVerified = verified === 'true';

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.question.count({ where }),
  ]);

  res.json({ success: true, data: { questions, total, page, limit } });
});

// ── GET /api/admin/questions/:id ───────────────────────────────────────────

router.get('/questions/:id', async (req: Request, res: Response) => {
  const question = await prisma.question.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { practiceAnswers: true } } },
  });

  if (!question) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Question not found' } });
    return;
  }

  res.json({ success: true, data: question });
});

// ── PATCH /api/admin/questions/:id ─────────────────────────────────────────

router.patch('/questions/:id', validate(updateQuestionSchema), async (req: Request, res: Response) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Question not found' } });
    return;
  }

  const updated = await prisma.question.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ success: true, data: updated });
});

// ── DELETE /api/admin/questions/:id ────────────────────────────────────────

router.delete('/questions/:id', async (req: Request, res: Response) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Question not found' } });
    return;
  }

  await prisma.question.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { deleted: true } });
});

// ── PATCH /api/admin/questions/:id/verify ─────────────────────────────────

router.patch('/questions/:id/verify', async (req: Request, res: Response) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Question not found' } });
    return;
  }

  const updated = await prisma.question.update({
    where: { id: req.params.id },
    data: { isVerified: true },
  });
  res.json({ success: true, data: updated });
});

// ── POST /api/admin/questions/generate ────────────────────────────────────

const generateSchema = z.object({
  category: z.enum(['QUANT', 'DILR', 'VARC']),
  difficulty: z.number().int().min(1).max(5),
  subTopic: z.string().optional(),
  count: z.number().int().min(1).max(20),
});

router.post('/questions/generate', validate(generateSchema), async (req: Request, res: Response) => {
  const { category, difficulty, subTopic, count } = req.body;

  const results = await generateQuestions({ category, difficulty, subTopic, count });

  res.status(201).json({ success: true, data: results });
});

// ── POST /api/admin/questions/bulk ─────────────────────────────────────────

router.post('/questions/bulk', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'CSV file required (field name: file)' } });
    return;
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(req.file.buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Could not parse CSV' } });
    return;
  }

  const valid: z.infer<typeof createQuestionSchema>[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    // Parse options from individual columns
    const parsed = {
      category: row.category,
      subTopic: row.sub_topic || undefined,
      difficulty: parseInt(row.difficulty),
      text: row.text,
      options: [row.option1, row.option2, row.option3, row.option4],
      correctAnswer: parseInt(row.correct_answer),
      explanation: row.explanation,
    };

    const result = createQuestionSchema.safeParse(parsed);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({ row: rowNum, message: result.error.issues[0].message });
    }
  }

  let inserted = 0;
  if (valid.length > 0) {
    const result = await prisma.question.createMany({
      data: valid.map((q) => ({ ...q, source: 'MANUAL' as const })),
    });
    inserted = result.count;
  }

  res.status(errors.length > 0 && inserted === 0 ? 400 : 201).json({
    success: true,
    data: { inserted, failed: errors.length, errors },
  });
});

export default router;
