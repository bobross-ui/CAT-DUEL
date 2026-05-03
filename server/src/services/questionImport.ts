import { z } from 'zod';
import { prisma } from '../models/prisma';
import { Prisma } from '../generated/prisma/client';

const IMPORT_DIFFICULTY = 3;

const importRowSchema = z.object({
  question_number: z.number().int().positive(),
  category: z.literal('QUANT'),
  type: z.enum(['MCQ', 'TITA']),
  sub_type: z.literal('QUANT_STANDARD'),
  text: z.string().min(10),
  options: z.array(z.string().min(1)).length(4).nullable(),
  correct_answer: z.string().min(1),
  sub_topic: z.string().min(1).nullable().optional(),
  explanation: z.string().min(10),
  source_pdf: z.string().min(1),
  answer_mismatch: z.boolean(),
}).superRefine((row, ctx) => {
  if (row.type === 'MCQ') {
    if (!row.options) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'MCQ options must contain 4 choices' });
    }

    const answerIndex = Number(row.correct_answer);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      ctx.addIssue({ code: 'custom', path: ['correct_answer'], message: 'MCQ correct_answer must be an index from 0 to 3' });
    }
  }

  if (row.type === 'TITA' && row.options !== null) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'TITA options must be null' });
  }
});

type ImportRow = z.infer<typeof importRowSchema>;

export type JsonlImportResult = {
  inserted: number;
  skipped: number;
  failed: number;
  errors: { row: number; message: string }[];
};

function parseLine(raw: string, lineNumber: number): ImportRow | { error: string } {
  try {
    const parsed = JSON.parse(raw);
    const result = importRowSchema.safeParse(parsed);
    if (!result.success) {
      return { error: result.error.issues[0].message };
    }
    return result.data;
  } catch {
    return { error: 'Invalid JSON' };
  }
}

export async function importQuestionsFromJsonl(content: string): Promise<JsonlImportResult> {
  const result: JsonlImportResult = { inserted: 0, skipped: 0, failed: 0, errors: [] };
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index++) {
    const rowNumber = index + 1;
    const row = parseLine(lines[index], rowNumber);
    if ('error' in row) {
      result.failed++;
      result.errors.push({ row: rowNumber, message: row.error });
      continue;
    }

    const existing = await prisma.question.findUnique({
      where: {
        sourcePdf_externalQuestionNumber: {
          sourcePdf: row.source_pdf,
          externalQuestionNumber: row.question_number,
        },
      },
      select: { id: true },
    });

    if (existing) {
      result.skipped++;
      continue;
    }

    await prisma.question.create({
      data: {
        category: row.category,
        questionType: row.type,
        subTopic: row.sub_topic ?? null,
        subType: row.sub_type,
        difficulty: IMPORT_DIFFICULTY,
        text: row.text,
        options: row.type === 'MCQ' ? (row.options ?? []) : Prisma.DbNull,
        correctAnswer: row.type === 'MCQ' ? Number(row.correct_answer) : null,
        correctAnswerText: row.type === 'TITA' ? row.correct_answer : null,
        explanation: row.explanation,
        source: 'EXTRACTED',
        sourcePdf: row.source_pdf,
        externalQuestionNumber: row.question_number,
        answerMismatch: row.answer_mismatch,
        isVerified: row.answer_mismatch === false,
      },
    });
    result.inserted++;
  }

  return result;
}
