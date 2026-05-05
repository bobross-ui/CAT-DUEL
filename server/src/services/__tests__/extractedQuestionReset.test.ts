import { resetExtractedQuestions } from '../extractedQuestionReset';
import { prisma } from '../../models/prisma';

jest.mock('../../models/prisma', () => ({
  prisma: {
    question: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const findMany = prisma.question.findMany as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

describe('resetExtractedQuestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes extracted questions and dependent answers only', async () => {
    findMany.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    const tx = {
      practiceAnswer: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      matchAnswer: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
      question: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    transaction.mockImplementation((callback) => callback(tx));

    const result = await resetExtractedQuestions();

    expect(findMany).toHaveBeenCalledWith({
      where: { source: 'EXTRACTED' },
      select: { id: true },
    });
    expect(tx.practiceAnswer.deleteMany).toHaveBeenCalledWith({
      where: { questionId: { in: ['q1', 'q2'] } },
    });
    expect(tx.matchAnswer.deleteMany).toHaveBeenCalledWith({
      where: { questionId: { in: ['q1', 'q2'] } },
    });
    expect(tx.question.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['q1', 'q2'] } },
    });
    expect(result).toEqual({
      questionsDeleted: 2,
      practiceAnswersDeleted: 3,
      matchAnswersDeleted: 4,
    });
  });

  it('does nothing when there are no extracted questions', async () => {
    findMany.mockResolvedValue([]);

    await expect(resetExtractedQuestions()).resolves.toEqual({
      questionsDeleted: 0,
      practiceAnswersDeleted: 0,
      matchAnswersDeleted: 0,
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
