import { backfillExtractedMathText } from '../extractedMathBackfill';
import { prisma } from '../../models/prisma';

jest.mock('../../models/prisma', () => ({
  prisma: {
    question: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const findMany = prisma.question.findMany as jest.Mock;
const update = prisma.question.update as jest.Mock;

describe('backfillExtractedMathText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    update.mockResolvedValue({});
  });

  it('updates only extracted rows whose display fields change', async () => {
    findMany.mockResolvedValue([
      {
        id: 'needs-normalization',
        text: 'Angle $60^\\circ$',
        options: ['$5\\sqrt{3}$', '$2\\pi$'],
        explanation: 'Root is $2^{6x}$ and $\\log_e x$.',
      },
      {
        id: 'already-normalized',
        text: 'Angle 60°',
        options: ['5√3', '2π'],
        explanation: 'Root is 2⁶ˣ and logₑ x.',
      },
    ]);

    const result = await backfillExtractedMathText();

    expect(findMany).toHaveBeenCalledWith({
      where: { source: 'EXTRACTED' },
      select: {
        id: true,
        text: true,
        options: true,
        explanation: true,
      },
    });
    expect(result).toEqual({ scanned: 2, updated: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'needs-normalization' },
      data: {
        text: 'Angle 60°',
        options: ['5√3', '2π'],
        explanation: 'Root is 2⁶ˣ and logₑ x.',
      },
    });
  });
});
