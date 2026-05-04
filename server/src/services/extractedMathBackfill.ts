import { prisma } from '../models/prisma';
import { Prisma } from '../generated/prisma/client';
import { normalizeExtractedMathText } from './mathTextNormalizer';

export type ExtractedMathBackfillResult = {
  scanned: number;
  updated: number;
};

function normalizeOptions(options: unknown): Prisma.InputJsonValue | undefined {
  if (!Array.isArray(options)) return undefined;
  return options.map((option) => (
    typeof option === 'string' ? normalizeExtractedMathText(option) : option
  ));
}

export async function backfillExtractedMathText(): Promise<ExtractedMathBackfillResult> {
  const questions = await prisma.question.findMany({
    where: { source: 'EXTRACTED' },
    select: {
      id: true,
      text: true,
      options: true,
      explanation: true,
    },
  });

  let updated = 0;

  for (const question of questions) {
    const text = normalizeExtractedMathText(question.text);
    const options = normalizeOptions(question.options);
    const explanation = normalizeExtractedMathText(question.explanation);
    const optionsChanged = options !== undefined && JSON.stringify(options) !== JSON.stringify(question.options);

    if (
      text === question.text
      && !optionsChanged
      && explanation === question.explanation
    ) {
      continue;
    }

    const data: { text: string; options?: Prisma.InputJsonValue; explanation: string } = { text, explanation };
    if (optionsChanged) data.options = options;

    await prisma.question.update({
      where: { id: question.id },
      data,
    });
    updated++;
  }

  return { scanned: questions.length, updated };
}
