jest.mock('../../config/redis', () => ({
  redis: {
    del: jest.fn(),
    mget: jest.fn(),
    pipeline: jest.fn(),
    zcount: jest.fn(),
    zrangebyscore: jest.fn(),
  },
}));

jest.mock('../../models/prisma', () => ({
  prisma: {
    question: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

import { redis } from '../../config/redis';
import { prisma } from '../../models/prisma';
import {
  getPoolIds,
  getQuestionsContent,
  removeQuestionFromPool,
  syncQuestionPoolEntry,
  warmQuestionPool,
} from '../questionPool';

function createPipeline() {
  return {
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
    expire: jest.fn().mockReturnThis(),
    rename: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    zadd: jest.fn().mockReturnThis(),
    zrem: jest.fn().mockReturnThis(),
  };
}

const mockedRedis = redis as unknown as {
  del: jest.Mock;
  mget: jest.Mock;
  pipeline: jest.Mock;
  zcount: jest.Mock;
  zrangebyscore: jest.Mock;
};
const findMany = prisma.question.findMany as jest.Mock;

describe('questionPool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRedis.del.mockResolvedValue(1);
    mockedRedis.mget.mockResolvedValue([]);
    mockedRedis.pipeline.mockReturnValue(createPipeline());
    mockedRedis.zcount.mockResolvedValue(0);
    mockedRedis.zrangebyscore.mockResolvedValue([]);
    findMany.mockResolvedValue([]);
  });

  describe('warmQuestionPool', () => {
    it('atomically replaces populated pools and deletes empty category pools', async () => {
      const quantPipeline = createPipeline();
      const varcPipeline = createPipeline();
      mockedRedis.pipeline
        .mockReturnValueOnce(quantPipeline)
        .mockReturnValueOnce(varcPipeline);
      findMany.mockResolvedValueOnce([
        { id: 'question-1', category: 'QUANT', difficulty: 2 },
        { id: 'question-2', category: 'VARC', difficulty: 4 },
      ]);

      await warmQuestionPool();

      expect(mockedRedis.del).toHaveBeenCalledWith('qpool:DILR');
      expect(quantPipeline.zadd).toHaveBeenCalledWith(
        expect.stringMatching(/^qpool:QUANT:tmp:/),
        2,
        'question-1',
      );
      expect(quantPipeline.rename).toHaveBeenCalledWith(
        expect.stringMatching(/^qpool:QUANT:tmp:/),
        'qpool:QUANT',
      );
      expect(varcPipeline.zadd).toHaveBeenCalledWith(
        expect.stringMatching(/^qpool:VARC:tmp:/),
        4,
        'question-2',
      );
      expect(varcPipeline.rename).toHaveBeenCalledWith(
        expect.stringMatching(/^qpool:VARC:tmp:/),
        'qpool:VARC',
      );
    });
  });

  describe('syncQuestionPoolEntry', () => {
    it('drops content and removes unverified questions from their category pool', async () => {
      const pipeline = createPipeline();
      mockedRedis.pipeline.mockReturnValueOnce(pipeline);

      await syncQuestionPoolEntry({
        id: 'question-1',
        category: 'QUANT',
        difficulty: 3,
        isVerified: false,
      });

      expect(pipeline.del).toHaveBeenCalledWith('qcontent:question-1');
      expect(pipeline.zrem).toHaveBeenCalledWith('qpool:QUANT', 'question-1');
      expect(pipeline.zadd).not.toHaveBeenCalled();
      expect(pipeline.exec).toHaveBeenCalled();
    });

    it('drops stale content and upserts verified questions into their category pool', async () => {
      const pipeline = createPipeline();
      mockedRedis.pipeline.mockReturnValueOnce(pipeline);

      await syncQuestionPoolEntry({
        id: 'question-1',
        category: 'QUANT',
        difficulty: 3,
        isVerified: true,
      });

      expect(pipeline.del).toHaveBeenCalledWith('qcontent:question-1');
      expect(pipeline.zadd).toHaveBeenCalledWith('qpool:QUANT', 3, 'question-1');
      expect(pipeline.expire).toHaveBeenCalledWith('qpool:QUANT', 600);
      expect(pipeline.zrem).not.toHaveBeenCalled();
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  describe('removeQuestionFromPool', () => {
    it('drops cached content and removes deleted question IDs from the pool', async () => {
      const pipeline = createPipeline();
      mockedRedis.pipeline.mockReturnValueOnce(pipeline);

      await removeQuestionFromPool({ id: 'question-1', category: 'QUANT' });

      expect(pipeline.del).toHaveBeenCalledWith('qcontent:question-1');
      expect(pipeline.zrem).toHaveBeenCalledWith('qpool:QUANT', 'question-1');
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  describe('getPoolIds', () => {
    it('keeps the existing unbounded range query when no limit is provided', async () => {
      mockedRedis.zrangebyscore.mockResolvedValueOnce(['question-1']);

      const ids = await getPoolIds('QUANT', 2, 3);

      expect(ids).toEqual(['question-1']);
      expect(mockedRedis.zcount).not.toHaveBeenCalled();
      expect(mockedRedis.zrangebyscore).toHaveBeenCalledWith('qpool:QUANT', 2, 3);
    });

    it('returns all matching IDs when the pool fits within the requested limit', async () => {
      mockedRedis.zcount.mockResolvedValueOnce(2);
      mockedRedis.zrangebyscore.mockResolvedValueOnce(['question-1', 'question-2']);

      const ids = await getPoolIds('VARC', 2, 3, 40);

      expect(ids).toEqual(['question-1', 'question-2']);
      expect(mockedRedis.zcount).toHaveBeenCalledWith('qpool:VARC', 2, 3);
      expect(mockedRedis.zrangebyscore).toHaveBeenCalledWith('qpool:VARC', 2, 3);
    });

    it('samples a bounded range when the pool is larger than the requested limit', async () => {
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      mockedRedis.zcount.mockResolvedValueOnce(100);
      mockedRedis.zrangebyscore.mockResolvedValueOnce(['question-30']);

      const ids = await getPoolIds('DILR', 2, 3, 40);

      expect(ids).toEqual(['question-30']);
      expect(mockedRedis.zcount).toHaveBeenCalledWith('qpool:DILR', 2, 3);
      expect(mockedRedis.zrangebyscore).toHaveBeenCalledWith(
        'qpool:DILR',
        2,
        3,
        'LIMIT',
        30,
        40,
      );
      randomSpy.mockRestore();
    });
  });

  describe('getQuestionsContent', () => {
    it('only recaches verified rows from DB misses', async () => {
      const pipeline = createPipeline();
      mockedRedis.pipeline.mockReturnValueOnce(pipeline);
      mockedRedis.mget.mockResolvedValueOnce([null]);
      findMany.mockResolvedValueOnce([]);

      const questions = await getQuestionsContent(['question-1']);

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: ['question-1'] }, isVerified: true },
      }));
      expect(pipeline.set).not.toHaveBeenCalled();
      expect(questions.has('question-1')).toBe(false);
    });
  });
});
