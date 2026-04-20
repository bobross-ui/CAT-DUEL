import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../models/prisma';
import { startOfUtcDay } from '../services/streak';

const router = Router();

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const dayStart = startOfUtcDay(new Date());
    const matches = await prisma.match.findMany({
      where: {
        finishedAt: { gte: dayStart },
        OR: [
          { player1Id: req.user.id },
          { player2Id: req.user.id },
        ],
      },
      select: {
        player1Id: true,
        player2Id: true,
        player1EloChange: true,
        player2EloChange: true,
      },
    });

    const ratingChangeToday = matches.reduce((sum, match) => {
      if (match.player1Id === req.user.id) return sum + match.player1EloChange;
      if (match.player2Id === req.user.id) return sum + match.player2EloChange;
      return sum;
    }, 0);

    res.json({
      success: true,
      data: {
        ...req.user,
        ratingChangeToday,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
