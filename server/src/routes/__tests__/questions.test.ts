import { findNextPracticeQuestion } from '../questions';
import { prisma } from '../../models/prisma';

jest.mock('../../middleware/auth', () => ({
  authMiddleware: jest.fn((_req, _res, next) => next()),
}));

jest.mock('../../models/prisma', () => ({
  prisma: {
    question: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../../services/questionServeBuffer', () => ({
  bufferQuestionServes: jest.fn(),
}));

const findFirst = prisma.question.findFirst as jest.Mock;

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
