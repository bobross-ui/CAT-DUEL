import fs from 'fs';
import { importQuestionsFromJsonl } from '../questionImport';
import { prisma } from '../../models/prisma';

jest.mock('../../models/prisma', () => ({
  prisma: {
    question: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const samplePath = '/Users/kshitijghode/code/scraper/data/extracted/cat_2024_slot1_qa.jsonl';

const findUnique = prisma.question.findUnique as jest.Mock;
const create = prisma.question.create as jest.Mock;

function resetImportMocks() {
  const imported = new Set<string>();
  findUnique.mockImplementation(({ where }) => {
    const key = `${where.sourcePdf_externalQuestionNumber.sourcePdf}:${where.sourcePdf_externalQuestionNumber.externalQuestionNumber}`;
    return Promise.resolve(imported.has(key) ? { id: key } : null);
  });
  create.mockImplementation(({ data }) => {
    imported.add(`${data.sourcePdf}:${data.externalQuestionNumber}`);
    return Promise.resolve({ id: `${data.sourcePdf}:${data.externalQuestionNumber}`, ...data });
  });
}

describe('importQuestionsFromJsonl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetImportMocks();
  });

  it('imports the CAT Quant JSONL shape and skips duplicate imports', async () => {
    const content = fs.readFileSync(samplePath, 'utf-8');

    const first = await importQuestionsFromJsonl(content);
    const second = await importQuestionsFromJsonl(content);

    expect(first).toMatchObject({ inserted: 22, skipped: 0, failed: 0 });
    expect(second).toMatchObject({ inserted: 0, skipped: 22, failed: 0 });

    const createdRows = create.mock.calls.map(([arg]) => arg.data);
    expect(createdRows.filter((row) => row.questionType === 'MCQ')).toHaveLength(14);
    expect(createdRows.filter((row) => row.questionType === 'TITA')).toHaveLength(8);
    expect(createdRows.every((row) => row.category === 'QUANT')).toBe(true);
    expect(createdRows.every((row) => row.difficulty === 3)).toBe(true);
    expect(createdRows.every((row) => row.isVerified === true)).toBe(true);

    const tita = createdRows.find((row) => row.questionType === 'TITA');
    expect(tita.options).toBeDefined();
    expect(tita.correctAnswer).toBeNull();
    expect(tita.correctAnswerText).toBe('38');
  });

  it('returns row-level errors for malformed rows', async () => {
    const malformed = JSON.stringify({
      question_number: 1,
      category: 'QUANT',
      type: 'MCQ',
      sub_type: 'QUANT_STANDARD',
      text: 'This is a malformed MCQ with no valid options.',
      options: null,
      correct_answer: '0',
      sub_topic: 'Algebra',
      explanation: 'This explanation is long enough for validation.',
      source_pdf: 'sample.pdf',
      answer_mismatch: false,
    });

    const result = await importQuestionsFromJsonl(malformed);

    expect(result.inserted).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 1, message: 'MCQ options must contain 4 choices' });
  });
});
