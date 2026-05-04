import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const { prisma } = await import('../src/models/prisma');
  try {
    const { backfillExtractedMathText } = await import('../src/services/extractedMathBackfill');
    const result = await backfillExtractedMathText();
    console.log(`Backfilled extracted math text for ${result.updated}/${result.scanned} questions`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
