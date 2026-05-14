import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { importPassagesFromJsonl } from '../src/services/passageImport';
import { importQuestionsFromJsonl } from '../src/services/questionImport';
import { prisma } from '../src/models/prisma';

const dilrDir = process.argv[2] ?? join(__dirname, '../../dilr');

async function importDataset(datasetDir: string) {
  const name = datasetDir.split('/').pop()!;
  console.log(`\n── ${name} ──`);

  const passagesContent = readFileSync(join(datasetDir, 'passages.jsonl'), 'utf-8');
  const passageResult = await importPassagesFromJsonl(passagesContent);
  console.log(`  Passages: inserted=${passageResult.inserted} skipped=${passageResult.skipped} failed=${passageResult.failed}`);
  for (const e of passageResult.errors) console.error(`    Row ${e.row}: ${e.message}`);

  const questionsContent = readFileSync(join(datasetDir, 'questions.jsonl'), 'utf-8');
  const questionResult = await importQuestionsFromJsonl(questionsContent);
  console.log(`  Questions: inserted=${questionResult.inserted} skipped=${questionResult.skipped} failed=${questionResult.failed}`);
  for (const e of questionResult.errors) console.error(`    Row ${e.row}: ${e.message}`);
  if (questionResult.warnings.length) {
    console.warn(`  ${questionResult.warnings.length} TeX validation warning(s)`);
  }
}

async function main() {
  const datasets = readdirSync(dilrDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(dilrDir, d.name))
    .sort();

  console.log(`Importing ${datasets.length} datasets from ${dilrDir}`);
  for (const dir of datasets) {
    await importDataset(dir);
  }
  console.log('\nDone.');
}

main().finally(() => prisma.$disconnect());
