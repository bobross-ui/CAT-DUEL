import { Namespace } from 'socket.io';
import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import {
  initializeGame,
  GamePlayer,
  GamePlayerProfile,
  getActiveGameForUser,
  getPendingMatchForUser,
  RatingImpact,
} from './gameSession';
import { calculateElo } from './elo';

export type QueuePlayer = GamePlayer;

function publicProfile(user: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  eloRating: number;
}): GamePlayerProfile {
  return {
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    eloRating: user.eloRating,
  };
}

export async function createMatch(
  matchmakingNs: Namespace,
  gameNs: Namespace,
  player1: QueuePlayer,
  player2: QueuePlayer,
): Promise<void> {
  const gameId = crypto.randomUUID();

  await redis.zrem('matchmaking_queue', player1.userId, player2.userId);
  await redis.del(
    `queue_joined:${player1.userId}`,
    `queue_joined:${player2.userId}`,
  );

  const [p1User, p2User] = await Promise.all([
    prisma.user.findUnique({
      where: { id: player1.userId },
      select: { id: true, displayName: true, avatarUrl: true, eloRating: true, gamesPlayed: true },
    }),
    prisma.user.findUnique({
      where: { id: player2.userId },
      select: { id: true, displayName: true, avatarUrl: true, eloRating: true, gamesPlayed: true },
    }),
  ]);

  if (!p1User || !p2User) return;

  const [socket1, socket2] = await Promise.all([
    redis.get(`socket:mm:${player1.userId}`),
    redis.get(`socket:mm:${player2.userId}`),
  ]);

  const matchData = { gameId, duration: 120 }; // TODO: restore to 600 after testing

  function ratingImpactFor(
    self: { eloRating: number; gamesPlayed: number },
    opp: { eloRating: number },
  ): RatingImpact {
    return {
      win:  calculateElo({ playerElo: self.eloRating, opponentElo: opp.eloRating, playerGamesPlayed: self.gamesPlayed, actualScore: 1 }).delta,
      loss: calculateElo({ playerElo: self.eloRating, opponentElo: opp.eloRating, playerGamesPlayed: self.gamesPlayed, actualScore: 0 }).delta,
    };
  }

  const p1Profile = publicProfile(p1User);
  const p2Profile = publicProfile(p2User);
  const p1RatingImpact = ratingImpactFor(p1User, p2User);
  const p2RatingImpact = ratingImpactFor(p2User, p1User);

  await initializeGame(gameId, player1, player2, {
    player1Profile: p1Profile,
    player2Profile: p2Profile,
    player1RatingImpact: p1RatingImpact,
    player2RatingImpact: p2RatingImpact,
    gameNs,
  });

  if (socket1) {
    matchmakingNs.to(socket1).emit('match:found', {
      ...matchData,
      opponent: p2Profile,
      ratingImpact: p1RatingImpact,
    });
  }
  if (socket2) {
    matchmakingNs.to(socket2).emit('match:found', {
      ...matchData,
      opponent: p1Profile,
      ratingImpact: p2RatingImpact,
    });
  }
}

export function registerMatchmakingHandlers(matchmakingNs: Namespace): void {
  matchmakingNs.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('queue:join', async () => {
      const alreadyInQueue = await redis.zscore('matchmaking_queue', user.id);
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

      await redis.zadd('matchmaking_queue', user.eloRating, user.id);
      await redis.set(`queue_joined:${user.id}`, Date.now(), 'EX', 120);
      await redis.set(`socket:mm:${user.id}`, socket.id, 'EX', 120);

      const queueSize = await redis.zcard('matchmaking_queue');
      socket.emit('queue:joined', { position: queueSize });
    });

    socket.on('queue:leave', async () => {
      await redis.zrem('matchmaking_queue', user.id);
      await redis.del(`queue_joined:${user.id}`, `socket:mm:${user.id}`);
      socket.emit('queue:left');
    });

    socket.on('disconnect', async () => {
      await redis.zrem('matchmaking_queue', user.id);
      await redis.del(`queue_joined:${user.id}`, `socket:mm:${user.id}`);
    });
  });
}
