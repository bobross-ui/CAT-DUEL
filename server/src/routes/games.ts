import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getActiveGameForUser } from '../services/gameSession';
import { prisma } from '../models/prisma';
import { publicDisplayName } from '../services/displayName';

const router = Router();
const MAX_MATCH_HISTORY_LIMIT = 50;
const DEFAULT_MATCH_HISTORY_LIMIT = 20;
const RATING_HISTORY_LIMIT = 30;

type MatchHistoryCursor = {
  finishedAt: Date;
  id: string;
};

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstQueryValue(value[0]);
  return typeof value === 'string' ? value : undefined;
}

function parseMatchHistoryLimit(value: unknown): number {
  const raw = firstQueryValue(value);
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MATCH_HISTORY_LIMIT;
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MATCH_HISTORY_LIMIT;
  return Math.min(MAX_MATCH_HISTORY_LIMIT, parsed);
}

function encodeMatchHistoryCursor(match: { finishedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({
    finishedAt: match.finishedAt.toISOString(),
    id: match.id,
  })).toString('base64url');
}

function decodeMatchHistoryCursor(value: unknown): MatchHistoryCursor | null {
  const raw = firstQueryValue(value);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      finishedAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.finishedAt !== 'string' || typeof parsed.id !== 'string' || parsed.id.length === 0) {
      throw new Error('Invalid match history cursor shape');
    }

    const finishedAt = new Date(parsed.finishedAt);
    if (Number.isNaN(finishedAt.getTime())) {
      throw new Error('Invalid match history cursor date');
    }

    return { finishedAt, id: parsed.id };
  } catch {
    throw new Error('INVALID_HISTORY_CURSOR');
  }
}

// GET /api/games/active
router.get('/active', authMiddleware, async (req, res, next) => {
  try {
    const activeGame = await getActiveGameForUser(req.user.id);
    res.json({ success: true, data: activeGame ?? { gameId: null } });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/history?limit=20&cursor=...
router.get('/history', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = parseMatchHistoryLimit(req.query.limit);
    let cursor: MatchHistoryCursor | null;
    try {
      cursor = decodeMatchHistoryCursor(req.query.cursor);
    } catch {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid match history cursor' },
      });
    }

    const playerSelect = { select: { id: true, displayName: true, displayCode: true, avatarUrl: true, eloRating: true, rankTier: true, deletedAt: true, isBot: true, isGuest: true } };
    const userMatchWhere = { OR: [{ player1Id: userId }, { player2Id: userId }] };
    const cursorWhere = cursor
      ? {
          OR: [
            { finishedAt: { lt: cursor.finishedAt } },
            { finishedAt: cursor.finishedAt, id: { lt: cursor.id } },
          ],
        }
      : undefined;

    const fetchedMatches = await prisma.match.findMany({
      where: cursorWhere ? { AND: [userMatchWhere, cursorWhere] } : userMatchWhere,
      orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { player1: playerSelect, player2: playerSelect },
    });

    const hasMore = fetchedMatches.length > limit;
    const matches = fetchedMatches.slice(0, limit);
    const nextCursor = hasMore && matches.length > 0
      ? encodeMatchHistoryCursor(matches[matches.length - 1])
      : null;

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
          displayName: publicDisplayName(opponent),
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
        pagination: {
          cursor: firstQueryValue(req.query.cursor) ?? null,
          limit,
          nextCursor,
          hasMore,
        },
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
      select: {
        eloRating: true,
        peakElo: true,
        gamesPlayed: true,
        rankTier: true,
        wins: true,
        winRate: true,
        draws: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const userMatchWhere = { OR: [{ player1Id: userId }, { player2Id: userId }] };
    const ratingSnapshotSelect = {
      id: true,
      player1Id: true,
      player1EloAfter: true,
      player2EloAfter: true,
      finishedAt: true,
    } as const;

    const ratingMatches = await prisma.match.findMany({
      where: userMatchWhere,
      select: ratingSnapshotSelect,
      orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      take: RATING_HISTORY_LIMIT,
    });

    const eloHistory = ratingMatches
      .slice()
      .reverse()
      .map((m) => ({
        finishedAt: m.finishedAt,
        elo: m.player1Id === userId ? m.player1EloAfter : m.player2EloAfter,
      }))
      .filter((point) => point.elo > 0);

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
        peakElo: user.peakElo,
        eloHistory,
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
        player1: { select: { id: true, displayName: true, displayCode: true, avatarUrl: true, eloRating: true, rankTier: true, deletedAt: true, isBot: true, isGuest: true } },
        player2: { select: { id: true, displayName: true, displayCode: true, avatarUrl: true, eloRating: true, rankTier: true, deletedAt: true, isBot: true, isGuest: true } },
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
                explanationImages: true,
                passage: { select: { id: true, text: true, images: true } },
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
    res.json({
      success: true,
      data: {
        ...match,
        player1: { ...match.player1, displayName: publicDisplayName(match.player1) },
        player2: { ...match.player2, displayName: publicDisplayName(match.player2) },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
