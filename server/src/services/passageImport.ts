import { z } from 'zod';
import { prisma } from '../models/prisma';

const importRowSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(10),
  source_pdf: z.string().min(1),
});

type ImportRow = z.infer<typeof importRowSchema>;

export type PassageImportResult = {
  inserted: number;
  skipped: number;
  failed: number;
  errors: { row: number; message: string }[];
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

export async function importPassagesFromJsonl(content: string): Promise<PassageImportResult> {
  const result: PassageImportResult = { inserted: 0, skipped: 0, failed: 0, errors: [] };
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index++) {
    const rowNumber = index + 1;
    const row = parseLine(lines[index]);
    if ('error' in row) {
      result.failed++;
      result.errors.push({ row: rowNumber, message: row.error });
      continue;
    }

    const existing = await prisma.passage.findUnique({
      where: { sourcePdf_externalId: { sourcePdf: row.source_pdf, externalId: row.id } },
      select: { id: true },
    });

    if (existing) {
      result.skipped++;
      continue;
    }

    await prisma.passage.create({
      data: {
        externalId: row.id,
        text: row.text,
        sourcePdf: row.source_pdf,
        source: 'EXTRACTED',
      },
    });
    result.inserted++;
  }

  return result;
}
