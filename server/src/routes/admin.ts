import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import firebaseAdmin from '../config/firebase';
import { prisma } from '../models/prisma';
import { Prisma } from '../generated/prisma/client';
import { authMiddleware, requireFirebaseRevocationCheck } from '../middleware/auth';
import { adminOnly } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { invalidateUserById, blockFirebaseUid } from '../services/userCache';
import { importQuestionsFromJsonl, JsonlImportResult } from '../services/questionImport';
import { importPassagesFromJsonl, PassageImportResult } from '../services/passageImport';
import { resetExtractedQuestions } from '../services/extractedQuestionReset';
import { removeQuestionFromPool, syncQuestionPoolEntry } from '../services/questionPool';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 20 } });
const uploadBulk = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 100 } });
const jsonlUploadFields = ['file', 'files', 'files[]'] as const;

// All admin routes require auth, admin role, and Firebase revocation enforcement.
router.use(authMiddleware, adminOnly, requireFirebaseRevocationCheck);

// ── Zod schemas ────────────────────────────────────────────────────────────

const questionSchemaBase = z.object({
  questionType: z.enum(['MCQ', 'TITA']),
  category: z.enum(['QUANT', 'DILR', 'VARC']),
  subTopic: z.string().nullable().optional(),
  subType: z.string().nullable().optional(),
  difficulty: z.number().int().min(1).max(5),
  text: z.string().min(10),
  options: z.array(z.string().min(1)).length(4).nullable().optional(),
  correctAnswer: z.number().int().min(0).max(3).nullable().optional(),
  correctAnswerText: z.string().min(1).nullable().optional(),
  explanation: z.string().min(10),
  passageId: z.string().uuid().nullable().optional(),
});

const createQuestionSchema = questionSchemaBase.extend({
  questionType: z.enum(['MCQ', 'TITA']).default('MCQ'),
}).superRefine((question, ctx) => {
  if (question.questionType === 'MCQ') {
    if (!question.options) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'MCQ options are required' });
    }
    if (question.correctAnswer === undefined || question.correctAnswer === null) {
      ctx.addIssue({ code: 'custom', path: ['correctAnswer'], message: 'MCQ correctAnswer is required' });
    }
  }

  if (question.questionType === 'TITA') {
    if (question.options !== undefined && question.options !== null) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'TITA options must be null' });
    }
    if (!question.correctAnswerText) {
      ctx.addIssue({ code: 'custom', path: ['correctAnswerText'], message: 'TITA correctAnswerText is required' });
    }
  }

  if (question.passageId && question.category !== 'VARC') {
    ctx.addIssue({ code: 'custom', path: ['passageId'], message: 'passageId is only valid for VARC questions' });
  }
});

const updateQuestionSchema = questionSchemaBase.partial();
const verifyQuestionSchema = z.object({
  isVerified: z.boolean().default(true),
});

const createPassageSchema = z.object({
  text: z.string().min(10),
  sourcePdf: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
});

const updatePassageSchema = createPassageSchema.partial();

type QuestionInput = z.infer<typeof createQuestionSchema>;
type JsonlImportFileError = JsonlImportResult['errors'][number] & { file: string };
type JsonlImportFileWarning = JsonlImportResult['warnings'][number] & { file: string };

function normalizeQuestionData(question: QuestionInput) {
  return {
    ...question,
    options: question.questionType === 'MCQ' ? (question.options ?? []) : Prisma.DbNull,
    correctAnswer: question.questionType === 'MCQ' ? (question.correctAnswer ?? 0) : null,
    correctAnswerText: question.questionType === 'TITA' ? (question.correctAnswerText ?? '') : null,
  };
}

function getUploadedFiles(req: Request) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;

  const filesByField = req.files as Partial<Record<typeof jsonlUploadFields[number], Express.Multer.File[]>> | undefined;
  return jsonlUploadFields.flatMap((field) => filesByField?.[field] ?? []);
}

// ── POST /api/admin/users/:id/revoke-tokens ────────────────────────────────

export async function revokeUserTokens(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, firebaseUid: true },
  });
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    return;
  }

  await firebaseAdmin.auth().revokeRefreshTokens(user.firebaseUid);
  await Promise.all([invalidateUserById(user.id), blockFirebaseUid(user.firebaseUid)]);

  res.json({ success: true, data: { revoked: true } });
}

router.post('/users/:id/revoke-tokens', revokeUserTokens);

// ── POST /api/admin/questions ──────────────────────────────────────────────

router.post('/questions', validate(createQuestionSchema), async (req: Request, res: Response) => {
  const { passageId } = req.body as { passageId?: string };
  if (passageId) {
    const exists = await prisma.passage.findUnique({ where: { id: passageId }, select: { id: true } });
    if (!exists) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Passage not found' } });
      return;
    }
  }

  const question = await prisma.question.create({
    data: { ...normalizeQuestionData(req.body), source: 'MANUAL' },
  });
  await syncQuestionPoolEntry(question);
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

// ── POST /api/admin/questions/reset-extracted ─────────────────────────────
// Must be defined before /:id to avoid route conflict

router.post('/questions/reset-extracted', async (_req: Request, res: Response) => {
  const result = await resetExtractedQuestions();
  res.json({ success: true, data: result });
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

router.patch('/questions/:id', async (req: Request, res: Response) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Question not found' } });
    return;
  }

  const partial = updateQuestionSchema.safeParse(req.body);
  if (!partial.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: partial.error.issues[0].message } });
    return;
  }

  const merged = createQuestionSchema.safeParse({ ...question, ...partial.data });
  if (!merged.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: merged.error.issues[0].message } });
    return;
  }

  const { passageId } = merged.data as { passageId?: string | null };
  if (passageId) {
    const exists = await prisma.passage.findUnique({ where: { id: passageId }, select: { id: true } });
    if (!exists) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Passage not found' } });
      return;
    }
  }

  const updated = await prisma.question.update({
    where: { id: req.params.id },
    data: normalizeQuestionData(merged.data),
  });
  await syncQuestionPoolEntry(updated);
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
  await removeQuestionFromPool(question);
  res.json({ success: true, data: { deleted: true } });
});

// ── PATCH /api/admin/questions/:id/verify ─────────────────────────────────

router.patch('/questions/:id/verify', async (req: Request, res: Response) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Question not found' } });
    return;
  }

  const parsed = verifyQuestionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    return;
  }

  const updated = await prisma.question.update({
    where: { id: req.params.id },
    data: { isVerified: parsed.data.isVerified },
  });
  await syncQuestionPoolEntry(updated);
  res.json({ success: true, data: updated });
});

// ── POST /api/admin/questions/import-jsonl ─────────────────────────────────

router.post('/questions/import-jsonl', uploadBulk.fields(jsonlUploadFields.map((name) => ({ name, maxCount: 100 }))), async (req: Request, res: Response) => {
  const files = getUploadedFiles(req);
  if (files.length === 0) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'JSONL file required (field name: file or files)' } });
    return;
  }

  const result: Omit<JsonlImportResult, 'errors' | 'warnings'> & {
    errors: JsonlImportFileError[];
    warnings: JsonlImportFileWarning[];
  } = {
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    warnings: [],
  };
  const fileResults: (JsonlImportResult & { file: string })[] = [];

  for (const file of files) {
    const fileResult = await importQuestionsFromJsonl(file.buffer.toString('utf-8'));
    result.inserted += fileResult.inserted;
    result.skipped += fileResult.skipped;
    result.failed += fileResult.failed;
    result.errors.push(...fileResult.errors.map((error) => ({ file: file.originalname, ...error })));
    result.warnings.push(...fileResult.warnings.map((warning) => ({ file: file.originalname, ...warning })));
    fileResults.push({ file: file.originalname, ...fileResult });
  }

  res.status(result.inserted > 0 ? 201 : 200).json({ success: true, data: { ...result, files: fileResults } });
});

// ── POST /api/admin/passages ───────────────────────────────────────────────

router.post('/passages', validate(createPassageSchema), async (req: Request, res: Response) => {
  const passage = await prisma.passage.create({
    data: { ...req.body, source: 'MANUAL' },
  });
  res.status(201).json({ success: true, data: passage });
});

// ── GET /api/admin/passages ────────────────────────────────────────────────

router.get('/passages', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { verified } = req.query;

  const where: Record<string, unknown> = {};
  if (verified !== undefined) where.isVerified = verified === 'true';

  const [passages, total] = await Promise.all([
    prisma.passage.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { questions: true } } },
    }),
    prisma.passage.count({ where }),
  ]);

  res.json({ success: true, data: { passages, total, page, limit } });
});

// ── GET /api/admin/passages/:id ────────────────────────────────────────────

router.get('/passages/:id', async (req: Request, res: Response) => {
  const passage = await prisma.passage.findUnique({
    where: { id: req.params.id },
    include: { questions: true },
  });

  if (!passage) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Passage not found' } });
    return;
  }

  res.json({ success: true, data: passage });
});

// ── PATCH /api/admin/passages/:id ─────────────────────────────────────────

router.patch('/passages/:id', async (req: Request, res: Response) => {
  const passage = await prisma.passage.findUnique({ where: { id: req.params.id } });
  if (!passage) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Passage not found' } });
    return;
  }

  const parsed = updatePassageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    return;
  }

  const updated = await prisma.passage.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json({ success: true, data: updated });
});

// ── PATCH /api/admin/passages/:id/verify ──────────────────────────────────

router.patch('/passages/:id/verify', async (req: Request, res: Response) => {
  const passage = await prisma.passage.findUnique({ where: { id: req.params.id } });
  if (!passage) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Passage not found' } });
    return;
  }

  const parsed = verifyQuestionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    return;
  }

  const updated = await prisma.passage.update({
    where: { id: req.params.id },
    data: { isVerified: parsed.data.isVerified },
  });
  res.json({ success: true, data: updated });
});

// ── DELETE /api/admin/passages/:id ────────────────────────────────────────

router.delete('/passages/:id', async (req: Request, res: Response) => {
  const passage = await prisma.passage.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { questions: true } } },
  });

  if (!passage) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Passage not found' } });
    return;
  }

  if (passage._count.questions > 0) {
    res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: `Cannot delete passage with ${passage._count.questions} linked question(s)` },
    });
    return;
  }

  await prisma.passage.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { deleted: true } });
});

// ── POST /api/admin/passages/import-jsonl ─────────────────────────────────

router.post('/passages/import-jsonl', uploadBulk.fields(jsonlUploadFields.map((name) => ({ name, maxCount: 100 }))), async (req: Request, res: Response) => {
  const files = getUploadedFiles(req);
  if (files.length === 0) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'JSONL file required (field name: file or files)' } });
    return;
  }

  const result: PassageImportResult & { files: (PassageImportResult & { file: string })[] } = {
    inserted: 0, skipped: 0, failed: 0, errors: [], files: [],
  };

  for (const file of files) {
    const fileResult = await importPassagesFromJsonl(file.buffer.toString('utf-8'));
    result.inserted += fileResult.inserted;
    result.skipped += fileResult.skipped;
    result.failed += fileResult.failed;
    result.errors.push(...fileResult.errors.map((e) => ({ ...e, file: file.originalname })));
    result.files.push({ file: file.originalname, ...fileResult });
  }

  res.status(result.inserted > 0 ? 201 : 200).json({ success: true, data: result });
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
      questionType: 'MCQ',
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
      data: valid.map((q) => ({ ...normalizeQuestionData(q), source: 'MANUAL' as const })),
    });
    inserted = result.count;
  }

  res.status(errors.length > 0 && inserted === 0 ? 400 : 201).json({
    success: true,
    data: { inserted, failed: errors.length, errors },
  });
});

export default router;
