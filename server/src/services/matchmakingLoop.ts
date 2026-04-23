import { Namespace } from 'socket.io';
import { redis } from '../config/redis';
import { createMatch, QueuePlayer } from './matchmaking';

const INITIAL_RANGE = 150;
const EXPANDED_RANGE = 300;
const EXPAND_AFTER_MS = 30_000;
const TIMEOUT_MS = 60_000;

function parseQueueEntries(raw: string[]): QueuePlayer[] {
  const players: QueuePlayer[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    players.push({ userId: raw[i], elo: parseInt(raw[i + 1], 10) });
  }
  return players;
}

async function runMatchmaking(matchmakingNs: Namespace, gameNs: Namespace): Promise<void> {
  const raw = await redis.zrangebyscore(
    'matchmaking_queue',
    '-inf',
    '+inf',
    'WITHSCORES',
  );
  if (raw.length === 0) return;

  const players = parseQueueEntries(raw);
  const matched = new Set<string>();

  for (const player of players) {
    if (matched.has(player.userId)) continue;

    const joinedAt = await redis.get(`queue_joined:${player.userId}`);
    const waitTime = joinedAt ? Date.now() - parseInt(joinedAt, 10) : 0;
    const range = waitTime > EXPAND_AFTER_MS ? EXPANDED_RANGE : INITIAL_RANGE;

    const candidates = players.filter(
      (p) =>
        p.userId !== player.userId &&
        !matched.has(p.userId) &&
        Math.abs(p.elo - player.elo) <= range,
    );

    if (candidates.length > 0) {
      candidates.sort(
        (a, b) => Math.abs(a.elo - player.elo) - Math.abs(b.elo - player.elo),
      );
      const opponent = candidates[0];

      matched.add(player.userId);
      matched.add(opponent.userId);

      await createMatch(matchmakingNs, gameNs, player, opponent);
    } else if (waitTime > TIMEOUT_MS) {
      const socketId = await redis.get(`socket:mm:${player.userId}`);
      if (socketId) {
        matchmakingNs
          .to(socketId)
          .emit('queue:timeout', { message: 'No match found, try again later' });
      }
      await redis.zrem('matchmaking_queue', player.userId);
      await redis.del(
        `queue_joined:${player.userId}`,
        `socket:mm:${player.userId}`,
      );
    }
  }
}

export function startMatchmakingLoop(matchmakingNs: Namespace, gameNs: Namespace): void {
  setInterval(() => {
    runMatchmaking(matchmakingNs, gameNs).catch((err) =>
      console.error('Matchmaking loop error:', err),
    );
  }, 2000);
}
