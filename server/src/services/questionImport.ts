import { z } from 'zod';
import { prisma } from '../models/prisma';
import { Prisma } from '../generated/prisma/client';
import { TexValidationWarning, validateTexValue } from './texValidation';

const IMPORT_DIFFICULTY = 3;

const importRowSchema = z.object({
  question_number: z.number().int().positive(),
  category: z.enum(['QUANT', 'DILR', 'VARC']),
  type: z.enum(['MCQ', 'TITA']),
  sub_type: z.string().min(1),
  text: z.string().min(10),
  options: z.array(z.string().min(1)).length(4).nullable(),
  correct_answer: z.string().min(1),
  sub_topic: z.string().min(1).nullable().optional(),
  explanation: z.string().min(10),
  source_pdf: z.string().min(1),
  passage_id: z.string().nullable().optional(),
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
  warnings: TexValidationWarning[];
};

function parseLine(raw: string): ImportRow | { error: string } {
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

async function resolvePassageId(passageExternalId: string, sourcePdf: string): Promise<string | null> {
  const passage = await prisma.passage.findUnique({
    where: { sourcePdf_externalId: { sourcePdf, externalId: passageExternalId } },
    select: { id: true },
  });
  return passage?.id ?? null;
}

export async function importQuestionsFromJsonl(content: string): Promise<JsonlImportResult> {
  const result: JsonlImportResult = { inserted: 0, skipped: 0, failed: 0, errors: [], warnings: [] };
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index++) {
    const rowNumber = index + 1;
    const row = parseLine(lines[index]);
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

    const texWarnings = [
      ...validateTexValue(row.text, rowNumber, 'text'),
      ...(row.options ?? []).flatMap((option, optionIndex) => (
        validateTexValue(option, rowNumber, `options.${optionIndex}`)
      )),
      ...validateTexValue(row.explanation, rowNumber, 'explanation'),
    ];
    result.warnings.push(...texWarnings);
    const hasMathValidationError = texWarnings.length > 0;

    let passageId: string | null = null;
    if (row.passage_id) {
      passageId = await resolvePassageId(row.passage_id, row.source_pdf);
      if (!passageId) {
        result.failed++;
        result.errors.push({ row: rowNumber, message: `Passage not found for passage_id "${row.passage_id}" — import passages first` });
        continue;
      }
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
        answerMismatch: row.answer_mismatch || hasMathValidationError,
        isVerified: row.answer_mismatch === false && !hasMathValidationError,
        passageId,
      },
    });
    result.inserted++;
  }

  return result;
}
