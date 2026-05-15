import { Namespace } from 'socket.io';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import {
  autojoinBotPlayer,
  initializeGame,
  GamePlayer,
  GamePlayerProfile,
  getActiveGameForUser,
  getPendingMatchForUser,
  RatingImpact,
} from './gameSession';
import { calculateMatchElo } from './elo';
import { enforceSocketEventLimit } from './socketRateLimit';
import { withSentry } from '../lib/sentry';
import { logger } from '../lib/logger';

export type QueuePlayer = GamePlayer;

const QUEUE_KEY = 'matchmaking_queue';
const QUEUE_DUE_KEY = 'matchmaking_queue_due';

export type CreateMatchPhase = 'preflight' | 'post-commit';

export class CreateMatchError extends Error {
  phase: CreateMatchPhase;
  cause: unknown;
  gameId?: string;

  constructor(phase: CreateMatchPhase, cause: unknown, metadata: { gameId?: string } = {}) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`createMatch ${phase} failed: ${causeMessage}`);
    this.name = 'CreateMatchError';
    this.phase = phase;
    this.cause = cause;
    this.gameId = metadata.gameId;
    Object.setPrototypeOf(this, CreateMatchError.prototype);
  }
}

function publicProfile(user: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  eloRating: number;
  gamesPlayed: number;
  winRate: number;
}): GamePlayerProfile {
  return {
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    eloRating: user.eloRating,
    gamesPlayed: user.gamesPlayed,
    winRate: user.winRate,
  };
}

export async function createMatch(
  matchmakingNs: Namespace,
  gameNs: Namespace,
  player1: QueuePlayer,
  player2: QueuePlayer,
): Promise<void> {
  const gameId = crypto.randomUUID();

  let preflight:
    | {
        p1User: {
          id: string;
          displayName: string | null;
          avatarUrl: string | null;
          eloRating: number;
          gamesPlayed: number;
          winRate: number;
          isBot: boolean;
        };
        p2User: {
          id: string;
          displayName: string | null;
          avatarUrl: string | null;
          eloRating: number;
          gamesPlayed: number;
          winRate: number;
          isBot: boolean;
        };
        socket1: string | null;
        socket2: string | null;
        p1Profile: GamePlayerProfile;
        p2Profile: GamePlayerProfile;
        p1RatingImpact: RatingImpact;
        p2RatingImpact: RatingImpact;
      };

  try {
    const [p1User, p2User] = await Promise.all([
      prisma.user.findUnique({
        where: { id: player1.userId },
        select: { id: true, displayName: true, avatarUrl: true, eloRating: true, gamesPlayed: true, winRate: true, isBot: true },
      }),
      prisma.user.findUnique({
        where: { id: player2.userId },
        select: { id: true, displayName: true, avatarUrl: true, eloRating: true, gamesPlayed: true, winRate: true, isBot: true },
      }),
    ]);

    if (!p1User || !p2User) {
      throw new Error('matched user not found');
    }

    const [socket1, socket2] = await Promise.all([
      redis.get(`socket:mm:${player1.userId}`),
      redis.get(`socket:mm:${player2.userId}`),
    ]);

    const p1Profile = publicProfile(p1User);
    const p2Profile = publicProfile(p2User);
    const p1WinElo = calculateMatchElo({
      player1: { elo: p1User.eloRating, gamesPlayed: p1User.gamesPlayed },
      player2: { elo: p2User.eloRating, gamesPlayed: p2User.gamesPlayed },
      player1Score: 1,
      player2Score: 0,
    });
    const p2WinElo = calculateMatchElo({
      player1: { elo: p1User.eloRating, gamesPlayed: p1User.gamesPlayed },
      player2: { elo: p2User.eloRating, gamesPlayed: p2User.gamesPlayed },
      player1Score: 0,
      player2Score: 1,
    });
    const p1RatingImpact: RatingImpact = {
      win: p1WinElo.player1.delta,
      loss: p2WinElo.player1.delta,
    };
    const p2RatingImpact: RatingImpact = {
      win: p2WinElo.player2.delta,
      loss: p1WinElo.player2.delta,
    };

    preflight = {
      p1User,
      p2User,
      socket1,
      socket2,
      p1Profile,
      p2Profile,
      p1RatingImpact,
      p2RatingImpact,
    };
  } catch (err) {
    throw new CreateMatchError('preflight', err);
  }

  let gameInitialized = false;
  try {
    await redis.zrem(QUEUE_KEY, player1.userId, player2.userId);
    await redis.zrem(QUEUE_DUE_KEY, player1.userId, player2.userId);
    await redis.del(
      `queue_joined:${player1.userId}`,
      `queue_joined:${player2.userId}`,
    );

    await initializeGame(gameId, player1, player2, {
      player1Profile: preflight.p1Profile,
      player2Profile: preflight.p2Profile,
      player1RatingImpact: preflight.p1RatingImpact,
      player2RatingImpact: preflight.p2RatingImpact,
      player1IsBot: preflight.p1User.isBot,
      player2IsBot: preflight.p2User.isBot,
      gameNs,
    });
    gameInitialized = true;

    if (preflight.p2User.isBot) {
      await autojoinBotPlayer(gameId, player2.userId, gameNs);
    }

    const matchData = { gameId, duration: env.GAME_DURATION_SECONDS };
    if (preflight.socket1) {
      matchmakingNs.to(preflight.socket1).emit('match:found', {
        ...matchData,
        opponent: preflight.p2Profile,
        ratingImpact: preflight.p1RatingImpact,
      });
    }
    if (!preflight.p2User.isBot && preflight.socket2) {
      matchmakingNs.to(preflight.socket2).emit('match:found', {
        ...matchData,
        opponent: preflight.p1Profile,
        ratingImpact: preflight.p2RatingImpact,
      });
    }
    logger.info({ event: 'mm:match', gameId, player1Id: player1.userId, player2Id: player2.userId, player1Elo: preflight.p1User.eloRating, player2Elo: preflight.p2User.eloRating }, 'Match created');
  } catch (err) {
    throw new CreateMatchError(
      gameInitialized ? 'post-commit' : 'preflight',
      err,
      gameInitialized ? { gameId } : undefined,
    );
  }
}

export function registerMatchmakingHandlers(matchmakingNs: Namespace): void {
  matchmakingNs.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('queue:join', withSentry(async () => {
      if (!(await enforceSocketEventLimit(socket, 'queue:join', user.id))) return;

      if (!socket.data.emailVerified) {
        socket.emit('queue:error', { message: 'Verify your email to play ranked duels. Check your inbox (and spam folder) for the verification link.' });
        socket.disconnect(true);
        return;
      }

      const alreadyInQueue = await redis.zscore(QUEUE_KEY, user.id);
      if (alreadyInQueue) return;

      const activeGame = await getActiveGameForUser(user.id);
      if (activeGame) {
        socket.emit('queue:active_game', activeGame);
        return;
      }

      const pendingMatch = await getPendingMatchForUser(user.id);
      if (pendingMatch) {
        socket.emit('match:found', pendingMatch);
        return;
      }

      const joinedAt = Date.now();
      await redis.zadd(QUEUE_KEY, user.eloRating, user.id);
      await redis.zadd(QUEUE_DUE_KEY, joinedAt, user.id);
      await redis.set(`queue_joined:${user.id}`, joinedAt, 'EX', 120);
      await redis.set(`socket:mm:${user.id}`, socket.id, 'EX', 120);

      const queueSize = await redis.zcard(QUEUE_KEY);
      socket.emit('queue:joined', { position: queueSize });
      logger.info({ event: 'mm:join', userId: user.id, eloRating: user.eloRating, queuePosition: queueSize }, 'Player joined matchmaking queue');
    }));

    socket.on('queue:leave', withSentry(async () => {
      if (!(await enforceSocketEventLimit(socket, 'queue:leave', user.id))) return;

      await redis.zrem(QUEUE_KEY, user.id);
      await redis.zrem(QUEUE_DUE_KEY, user.id);
      await redis.del(`queue_joined:${user.id}`, `socket:mm:${user.id}`);
      socket.emit('queue:left');
    }));

    socket.on('disconnect', withSentry(async () => {
      await redis.zrem(QUEUE_KEY, user.id);
      await redis.zrem(QUEUE_DUE_KEY, user.id);
      await redis.del(`queue_joined:${user.id}`, `socket:mm:${user.id}`);
    }));
  });
}
