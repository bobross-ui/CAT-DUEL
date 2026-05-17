const mockRedis = {
  mget: jest.fn(),
  set: jest.fn(),
};

jest.mock('../../config/redis', () => ({
  redis: mockRedis,
}));

jest.mock('../../models/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
    },
  },
}));

import type { User } from '../../generated/prisma/client';
import { prisma } from '../../models/prisma';
import { botBusyKey, getBotForPlayer, rollBotCorrect } from '../botPlayer';

const findMany = prisma.user.findMany as jest.Mock;

function bot(id: string, eloRating: number): User {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    firebaseUid: `bot:${id}`,
    email: null,
    displayName: id,
    displayCode: '300001',
    avatarUrl: null,
    role: 'user',
    isBot: true,
    isGuest: false,
    eloRating,
    peakElo: eloRating,
    rankTier: 'SILVER',
    gamesPlayed: 30,
    wins: 15,
    draws: 1,
    winRate: 0.5,
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    onboardingCompletedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('botPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    mockRedis.mget.mockResolvedValue([]);
    mockRedis.set.mockResolvedValue('OK');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getBotForPlayer', () => {
    it('filters candidates on active_game, pending_match, and bot_busy keys', async () => {
      const activeBot = bot('active', 1195);
      const pendingBot = bot('pending', 1205);
      const busyBot = bot('busy', 1210);
      const availableBot = bot('available', 1230);
      findMany.mockResolvedValue([availableBot, busyBot, pendingBot, activeBot]);
      mockRedis.mget.mockImplementation(async (...keys: string[]) => (
        keys.map((key) => {
          if (key === 'active_game:active') return 'game-1';
          if (key === 'pending_match:pending') return 'game-2';
          if (key === botBusyKey('busy')) return '1';
          return null;
        })
      ));

      const selected = await getBotForPlayer(1200);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isBot: true,
          deletedAt: null,
        },
      });
      expect(selected).toBe(availableBot);
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        botBusyKey('available'),
        '1',
        'EX',
        60,
        'NX',
      );
    });

    it('falls through to the next closest candidate when the bot_busy claim collides', async () => {
      const closestBot = bot('closest', 1190);
      const nextBot = bot('next', 1220);
      findMany.mockResolvedValue([nextBot, closestBot]);
      mockRedis.mget.mockResolvedValue([null, null, null, null, null, null]);
      mockRedis.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      const selected = await getBotForPlayer(1200);

      expect(selected).toBe(nextBot);
      expect(mockRedis.set).toHaveBeenNthCalledWith(
        1,
        botBusyKey('closest'),
        '1',
        'EX',
        60,
        'NX',
      );
      expect(mockRedis.set).toHaveBeenNthCalledWith(
        2,
        botBusyKey('next'),
        '1',
        'EX',
        60,
        'NX',
      );
    });

    it('returns null when all candidates are unavailable', async () => {
      findMany.mockResolvedValue([bot('busy', 1200)]);
      mockRedis.mget.mockResolvedValue([null, null, '1']);

      await expect(getBotForPlayer(1200)).resolves.toBeNull();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('rollBotCorrect', () => {
    it('clamps high Elo advantage at 80 percent', () => {
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.79).mockReturnValueOnce(0.8);

      expect(rollBotCorrect(1000, 3000)).toBe(true);
      expect(rollBotCorrect(1000, 3000)).toBe(false);
    });

    it('clamps low Elo disadvantage at 20 percent', () => {
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.19).mockReturnValueOnce(0.2);

      expect(rollBotCorrect(3000, 1000)).toBe(true);
      expect(rollBotCorrect(3000, 1000)).toBe(false);
    });

    it('uses 50 percent for equal Elo', () => {
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.49).mockReturnValueOnce(0.5);

      expect(rollBotCorrect(1200, 1200)).toBe(true);
      expect(rollBotCorrect(1200, 1200)).toBe(false);
    });
  });
});
