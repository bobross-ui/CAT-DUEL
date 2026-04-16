import { Namespace } from 'socket.io';
import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import { initializeGame, GamePlayer } from './gameSession';

export type QueuePlayer = GamePlayer;

function publicProfile(user: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  eloRating: number;
}) {
  return {
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    eloRating: user.eloRating,
  };
}

export async function createMatch(
  matchmakingNs: Namespace,
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
      select: { id: true, displayName: true, avatarUrl: true, eloRating: true },
    }),
    prisma.user.findUnique({
      where: { id: player2.userId },
      select: { id: true, displayName: true, avatarUrl: true, eloRating: true },
    }),
  ]);

  if (!p1User || !p2User) return;

  const [socket1, socket2] = await Promise.all([
    redis.get(`socket:mm:${player1.userId}`),
    redis.get(`socket:mm:${player2.userId}`),
  ]);

  const matchData = { gameId, duration: 600 };

  if (socket1) {
    matchmakingNs.to(socket1).emit('match:found', {
      ...matchData,
      opponent: publicProfile(p2User),
    });
  }
  if (socket2) {
    matchmakingNs.to(socket2).emit('match:found', {
      ...matchData,
      opponent: publicProfile(p1User),
    });
  }

  await initializeGame(gameId, player1, player2);
}

export function registerMatchmakingHandlers(matchmakingNs: Namespace): void {
  matchmakingNs.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('queue:join', async () => {
      const alreadyInQueue = await redis.zscore('matchmaking_queue', user.id);
      if (alreadyInQueue) return;

      const activeGame = await redis.get(`active_game:${user.id}`);
      if (activeGame) {
        socket.emit('queue:error', { message: 'You are already in a game' });
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
