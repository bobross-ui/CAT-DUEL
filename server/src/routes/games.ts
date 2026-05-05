import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getActiveGameForUser } from '../services/gameSession';
import { prisma } from '../models/prisma';
import { redis } from '../config/redis';

const router = Router();

// GET /api/games/active
router.get('/active', authMiddleware, async (req, res, next) => {
  try {
    const activeGame = await getActiveGameForUser(req.user.id);
    res.json({ success: true, data: activeGame ?? { gameId: null } });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/history?page=1&limit=20
router.get('/history', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where: { OR: [{ player1Id: userId }, { player2Id: userId }] },
        orderBy: { finishedAt: 'desc' },
        skip,
        take: limit,
        include: {
          player1: { select: { id: true, displayName: true, avatarUrl: true, eloRating: true, rankTier: true } },
          player2: { select: { id: true, displayName: true, avatarUrl: true, eloRating: true, rankTier: true } },
        },
      }),
      prisma.match.count({
        where: { OR: [{ player1Id: userId }, { player2Id: userId }] },
      }),
    ]);

    const entries = matches.map((m) => {
      const isPlayer1 = m.player1Id === userId;
      const opponent = isPlayer1 ? m.player2 : m.player1;
      const yourScore = isPlayer1 ? m.player1Score : m.player2Score;
      const opponentScore = isPlayer1 ? m.player2Score : m.player1Score;
      const yourEloChange = isPlayer1 ? m.player1EloChange : m.player2EloChange;

      let outcome: 'WIN' | 'LOSS' | 'DRAW';
      if (m.winnerId === userId) outcome = 'WIN';
      else if (m.winnerId == null) outcome = 'DRAW';
      else outcome = 'LOSS';

      return {
        matchId: m.id,
        outcome,
        yourScore,
        opponentScore,
        yourEloChange,
        opponent: {
          id: opponent.id,
          displayName: opponent.displayName,
          avatarUrl: opponent.avatarUrl,
          eloRating: opponent.eloRating,
          rankTier: opponent.rankTier,
        },
        status: m.status,
        durationSeconds: m.durationSeconds,
        finishedAt: m.finishedAt,
      };
    });

    res.json({
      success: true,
      data: {
        entries,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/stats
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { eloRating: true, gamesPlayed: true, rankTier: true, wins: true, winRate: true, draws: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const eloCacheKey = `stats:elo:${userId}:${user.gamesPlayed}`;
    let eloStats: {
      peakElo: number;
      eloHistory: { finishedAt: Date | string; elo: number }[];
    } | null = null;

    try {
      const cached = await redis.get(eloCacheKey);
      if (cached) eloStats = JSON.parse(cached);
    } catch (err) {
      console.error('[games/stats] elo cache read failed:', err);
    }

    if (!eloStats) {
      const matches = await prisma.match.findMany({
        where: { OR: [{ player1Id: userId }, { player2Id: userId }] },
        select: {
          player1Id: true,
          player1EloChange: true,
          player2EloChange: true,
          finishedAt: true,
        },
        orderBy: { finishedAt: 'asc' },
      });

      const deltas = matches.map((m) =>
        m.player1Id === userId ? m.player1EloChange : m.player2EloChange,
      );
      const totalDelta = deltas.reduce((a, b) => a + b, 0);
      let runningElo = user.eloRating - totalDelta;

      const eloHistory: { finishedAt: Date; elo: number }[] = [];

      for (let i = 0; i < matches.length; i++) {
        runningElo += deltas[i];
        eloHistory.push({ finishedAt: matches[i].finishedAt, elo: runningElo });
      }

      eloStats = {
        peakElo: eloHistory.length
          ? Math.max(...eloHistory.map((h) => h.elo), user.eloRating)
          : user.eloRating,
        eloHistory,
      };

      try {
        await redis.set(eloCacheKey, JSON.stringify(eloStats), 'EX', 300);
      } catch (err) {
        console.error('[games/stats] elo cache write failed:', err);
      }
    }

    const losses = Math.max(0, user.gamesPlayed - user.wins - user.draws);

    res.json({
      success: true,
      data: {
        currentElo: user.eloRating,
        rankTier: user.rankTier,
        gamesPlayed: user.gamesPlayed,
        wins: user.wins,
        losses,
        draws: user.draws,
        winRate: user.winRate,
        peakElo: eloStats.peakElo,
        eloHistory: eloStats.eloHistory,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/:id — full match detail with both players' answers
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        player1: { select: { id: true, displayName: true, avatarUrl: true, eloRating: true, rankTier: true } },
        player2: { select: { id: true, displayName: true, avatarUrl: true, eloRating: true, rankTier: true } },
        answers: {
          include: {
            question: {
              select: {
                id: true,
                category: true,
                questionType: true,
                subTopic: true,
                subType: true,
                text: true,
                options: true,
                correctAnswer: true,
                correctAnswerText: true,
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

    res.set('Cache-Control', 'private, immutable, max-age=86400');
    res.json({ success: true, data: match });
  } catch (err) {
    next(err);
  }
});

export default router;
