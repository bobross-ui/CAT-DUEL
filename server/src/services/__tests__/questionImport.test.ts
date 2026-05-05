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
    expect(createdRows.every((row) => row.isVerified === !row.answerMismatch)).toBe(true);

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

  it('stores extracted TeX unchanged before client rendering', async () => {
    const row = JSON.stringify({
      question_number: 1,
      category: 'QUANT',
      type: 'MCQ',
      sub_type: 'QUANT_STANDARD',
      text: 'A chord subtends $60^\\circ$ and another subtends $120^\\circ$.',
      options: ['$5\\sqrt{3}$', '$2\\pi$', '$8$', '$6\\sqrt{2}$'],
      correct_answer: '0',
      sub_topic: 'Geometry',
      explanation: 'Use $2^{6x}$ and $\\frac{\\log_2 3}{3}$ as examples.',
      source_pdf: 'sample.pdf',
      answer_mismatch: false,
    });

    const result = await importQuestionsFromJsonl(row);

    expect(result).toMatchObject({ inserted: 1, skipped: 0, failed: 0 });
    const created = create.mock.calls[0][0].data;
    expect(created.text).toBe('A chord subtends $60^\\circ$ and another subtends $120^\\circ$.');
    expect(created.options).toEqual(['$5\\sqrt{3}$', '$2\\pi$', '$8$', '$6\\sqrt{2}$']);
    expect(created.explanation).toBe('Use $2^{6x}$ and $\\frac{\\log_2 3}{3}$ as examples.');
    expect(created.isVerified).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('imports malformed TeX rows as unverified and returns warnings', async () => {
    const row = JSON.stringify({
      question_number: 2,
      category: 'QUANT',
      type: 'MCQ',
      sub_type: 'QUANT_STANDARD',
      text: 'This row has malformed math $\\frac{1}{$ but should still import.',
      options: ['$1$', '$2$', '$3$', '$4$'],
      correct_answer: '0',
      sub_topic: 'Algebra',
      explanation: 'This explanation is long enough for validation.',
      source_pdf: 'sample.pdf',
      answer_mismatch: false,
    });

    const result = await importQuestionsFromJsonl(row);

    expect(result.inserted).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.warnings[0]).toMatchObject({ row: 1, field: 'text' });
    const created = create.mock.calls[0][0].data;
    expect(created.text).toBe('This row has malformed math $\\frac{1}{$ but should still import.');
    expect(created.isVerified).toBe(false);
    expect(created.answerMismatch).toBe(true);
  });
});
