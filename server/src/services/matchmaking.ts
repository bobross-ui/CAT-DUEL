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
  GUEST_DURATION_SECONDS,
  RatingImpact,
} from './gameSession';
import { calculateMatchElo } from './elo';
import { botBusyKey, getBotForPlayer } from './botPlayer';
import { enforceSocketEventLimit } from './socketRateLimit';
import { withSentry } from '../lib/sentry';
import { logger } from '../lib/logger';
import { publicDisplayName } from './displayName';

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
  displayCode?: string | null;
  avatarUrl: string | null;
  eloRating: number;
  gamesPlayed: number;
  winRate: number;
  isBot?: boolean;
  isGuest?: boolean;
}): GamePlayerProfile {
  return {
    userId: user.id,
    displayName: publicDisplayName(user),
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
          displayCode: string | null;
          avatarUrl: string | null;
          eloRating: number;
          gamesPlayed: number;
          winRate: number;
          isBot: boolean;
        };
        p2User: {
          id: string;
          displayName: string | null;
          displayCode: string | null;
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
        select: { id: true, displayName: true, displayCode: true, avatarUrl: true, eloRating: true, gamesPlayed: true, winRate: true, isBot: true },
      }),
      prisma.user.findUnique({
        where: { id: player2.userId },
        select: { id: true, displayName: true, displayCode: true, avatarUrl: true, eloRating: true, gamesPlayed: true, winRate: true, isBot: true },
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

export type GuestMatchErrorCode = 'NOT_GUEST' | 'ALREADY_PLAYED' | 'NO_BOT_AVAILABLE' | 'INTERNAL';

export class GuestMatchError extends Error {
  code: GuestMatchErrorCode;

  constructor(code: GuestMatchErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'GuestMatchError';
    this.code = code;
    Object.setPrototypeOf(this, GuestMatchError.prototype);
  }
}

export async function createGuestMatch(
  matchmakingNs: Namespace,
  gameNs: Namespace,
  guestUserId: string,
  socketId: string,
): Promise<void> {
  const guest = await prisma.user.findUnique({
    where: { id: guestUserId },
    select: {
      id: true, displayName: true, displayCode: true, avatarUrl: true,
      eloRating: true, gamesPlayed: true, winRate: true,
      isGuest: true,
    },
  });

  if (!guest) throw new GuestMatchError('INTERNAL', 'guest user not found');
  if (!guest.isGuest) throw new GuestMatchError('NOT_GUEST');
  if (guest.gamesPlayed > 0) throw new GuestMatchError('ALREADY_PLAYED');

  const bot = await getBotForPlayer(guest.eloRating);
  if (!bot) throw new GuestMatchError('NO_BOT_AVAILABLE');

  const gameId = crypto.randomUUID();
  let gameInitialized = false;

  try {
    const guestProfile = publicProfile(guest);
    const botProfile = publicProfile(bot);
    const guestWinElo = calculateMatchElo({
      player1: { elo: guest.eloRating, gamesPlayed: guest.gamesPlayed },
      player2: { elo: bot.eloRating, gamesPlayed: bot.gamesPlayed },
      player1Score: 1,
      player2Score: 0,
    });
    const guestLossElo = calculateMatchElo({
      player1: { elo: guest.eloRating, gamesPlayed: guest.gamesPlayed },
      player2: { elo: bot.eloRating, gamesPlayed: bot.gamesPlayed },
      player1Score: 0,
      player2Score: 1,
    });
    const guestRatingImpact: RatingImpact = {
      win: guestWinElo.player1.delta,
      loss: guestLossElo.player1.delta,
    };
    const botRatingImpact: RatingImpact = {
      win: guestLossElo.player2.delta,
      loss: guestWinElo.player2.delta,
    };

    await initializeGame(
      gameId,
      { userId: guest.id, elo: guest.eloRating },
      { userId: bot.id, elo: bot.eloRating },
      {
        player1Profile: guestProfile,
        player2Profile: botProfile,
        player1RatingImpact: guestRatingImpact,
        player2RatingImpact: botRatingImpact,
        player1IsBot: false,
        player2IsBot: true,
        mode: 'guest_practice',
        gameNs,
      },
    );
    gameInitialized = true;

    await autojoinBotPlayer(gameId, bot.id, gameNs);

    matchmakingNs.to(socketId).emit('match:found', {
      gameId,
      duration: GUEST_DURATION_SECONDS,
      opponent: botProfile,
      ratingImpact: guestRatingImpact,
    });
    logger.info({ event: 'mm:guest', gameId, guestId: guest.id, botId: bot.id, guestElo: guest.eloRating, botElo: bot.eloRating }, 'Guest match created');
  } catch (err) {
    if (!gameInitialized) {
      await redis.del(botBusyKey(bot.id)).catch(() => {});
    }
    throw err;
  }
}

export function registerMatchmakingHandlers(matchmakingNs: Namespace, gameNs: Namespace): void {
  matchmakingNs.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('queue:join', withSentry(async () => {
      if (!(await enforceSocketEventLimit(socket, 'queue:join', user.id))) return;

      if (user.isGuest) {
        socket.emit('queue:error', { message: 'Sign up to play ranked duels.' });
        return;
      }

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

    socket.on('guest:start', withSentry(async () => {
      if (!(await enforceSocketEventLimit(socket, 'guest:start', user.id))) return;

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

      await redis.set(`socket:mm:${user.id}`, socket.id, 'EX', 120);

      try {
        await createGuestMatch(matchmakingNs, gameNs, user.id, socket.id);
      } catch (err) {
        if (err instanceof GuestMatchError) {
          socket.emit('guest:error', { code: err.code });
          return;
        }
        throw err;
      }
    }));

    socket.on('disconnect', withSentry(async () => {
      await redis.zrem(QUEUE_KEY, user.id);
      await redis.zrem(QUEUE_DUE_KEY, user.id);
      await redis.del(`queue_joined:${user.id}`, `socket:mm:${user.id}`);
    }));
  });
}
