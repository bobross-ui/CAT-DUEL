import express from 'express';
import type { AddressInfo } from 'net';
import questionsRouter, { findNextPracticeQuestion } from '../questions';
import { prisma } from '../../models/prisma';

jest.mock('../../middleware/auth', () => ({
  authMiddleware: jest.fn((req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  }),
}));

jest.mock('../../middleware/rateLimit', () => ({
  practiceAnswerRateLimit: jest.fn((_req, _res, next) => next()),
}));

jest.mock('../../models/prisma', () => ({
  prisma: {
    question: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    practiceAnswer: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../services/questionServeBuffer', () => ({
  bufferQuestionServes: jest.fn(),
}));

const findFirst = prisma.question.findFirst as jest.Mock;
const findUnique = prisma.question.findUnique as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

async function postAnswer(questionId: string, payload: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/questions', questionsRouter);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/questions/${questionId}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('findNextPracticeQuestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('excludes questions the user has already answered in practice', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'question-2',
      category: 'QUANT',
      questionType: 'MCQ',
      subTopic: null,
      subType: null,
      difficulty: 3,
      text: 'Unseen question',
      options: ['A', 'B', 'C', 'D'],
    });

    await findNextPracticeQuestion('user-1', ['QUANT'], {}, undefined);

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        category: 'QUANT',
        isVerified: true,
        practiceAnswers: { none: { userId: 'user-1' } },
      }),
    }));
  });

  it('falls back without dropping the unseen-question filter when the random skip misses', async () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.5);
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'question-1',
      category: 'QUANT',
      questionType: 'MCQ',
      subTopic: null,
      subType: null,
      difficulty: 3,
      text: 'Fallback unseen question',
      options: ['A', 'B', 'C', 'D'],
    });

    await findNextPracticeQuestion('user-1', ['QUANT'], {}, undefined);

    const fallbackQuery = findFirst.mock.calls[1][0];
    expect(fallbackQuery).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        practiceAnswers: { none: { userId: 'user-1' } },
      }),
    }));
    expect(fallbackQuery).not.toHaveProperty('skip');
  });

  it('allows repeats only after all matching questions have been answered', async () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'question-1',
      category: 'QUANT',
      questionType: 'MCQ',
      subTopic: null,
      subType: null,
      difficulty: 1,
      text: 'Repeated easy question',
      options: ['A', 'B', 'C', 'D'],
    });

    const question = await findNextPracticeQuestion('user-1', ['QUANT'], {}, 1);

    expect(question).toMatchObject({ id: 'question-1' });
    expect(findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        category: 'QUANT',
        difficulty: 1,
        practiceAnswers: { none: { userId: 'user-1' } },
      }),
    }));
    expect(findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.not.objectContaining({
        practiceAnswers: expect.anything(),
      }),
    }));
  });
});

describe('POST /questions/:id/answer validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects oversized typed answers before looking up or persisting the answer', async () => {
    const response = await postAnswer('00000000-0000-4000-8000-000000000002', {
      typedAnswer: 'x'.repeat(129),
      timeTakenMs: 1000,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects answer shapes that do not match the stored question type', async () => {
    findUnique.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000002',
      questionType: 'TITA',
      correctAnswer: null,
      correctAnswerText: '42',
      explanation: 'Because 42.',
    });

    const response = await postAnswer('00000000-0000-4000-8000-000000000002', {
      selectedAnswer: 2,
      timeTakenMs: 1000,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Answer shape does not match question type',
      },
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
