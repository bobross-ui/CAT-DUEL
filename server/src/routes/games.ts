import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getActiveGameId } from '../services/gameSession';
import { prisma } from '../models/prisma';

const router = Router();

// GET /api/games/active
router.get('/active', authMiddleware, async (req, res, next) => {
  try {
    const gameId = await getActiveGameId(req.user.id);
    res.json({ success: true, data: { gameId: gameId ?? null } });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/history — last 20 matches for the auth user
router.get('/history', authMiddleware, async (req, res, next) => {
  try {
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ player1Id: req.user.id }, { player2Id: req.user.id }],
      },
      orderBy: { finishedAt: 'desc' },
      take: 20,
      include: {
        player1: { select: { id: true, displayName: true, eloRating: true } },
        player2: { select: { id: true, displayName: true, eloRating: true } },
      },
    });
    res.json({ success: true, data: matches });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/:id — full match detail with the requesting user's answers + question info
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        answers: {
          where: { userId: req.user.id },
          include: {
            question: {
              select: {
                id: true,
                category: true,
                text: true,
                options: true,
                correctAnswer: true,
                explanation: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });
    }
    if (match.player1Id !== req.user.id && match.player2Id !== req.user.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not your match' } });
    }

    res.json({ success: true, data: match });
  } catch (err) {
    next(err);
  }
});

export default router;
