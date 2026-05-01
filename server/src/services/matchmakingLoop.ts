import { Namespace } from 'socket.io';
import { redis } from '../config/redis';
import { createMatch, QueuePlayer } from './matchmaking';

const INITIAL_RANGE = 150;
const EXPANDED_RANGE = 300;
const EXPAND_AFTER_MS = 30_000;
const TIMEOUT_MS = 60_000;
const LOCK_KEY = 'matchmaking:lock';
const LOCK_TTL_SECONDS = 10;
const CLAIM_TTL_SECONDS = 30;

function claimKey(userId: string): string {
  return `matchmaking:claim:${userId}`;
}

async function releaseLock(token: string): Promise<void> {
  await redis.eval(
    `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    end
    return 0
    `,
    1,
    LOCK_KEY,
    token,
  );
}

async function claimPlayers(player1: QueuePlayer, player2: QueuePlayer): Promise<string | null> {
  const token = crypto.randomUUID();
  const claimed = await redis.eval(
    `
    if redis.call("exists", KEYS[1]) == 1 or redis.call("exists", KEYS[2]) == 1 then
      return 0
    end
    if not redis.call("zscore", KEYS[3], ARGV[1]) or not redis.call("zscore", KEYS[3], ARGV[2]) then
      return 0
    end
    redis.call("set", KEYS[1], ARGV[3], "EX", ARGV[4])
    redis.call("set", KEYS[2], ARGV[3], "EX", ARGV[4])
    redis.call("zrem", KEYS[3], ARGV[1], ARGV[2])
    return 1
    `,
    3,
    claimKey(player1.userId),
    claimKey(player2.userId),
    'matchmaking_queue',
    player1.userId,
    player2.userId,
    token,
    CLAIM_TTL_SECONDS,
  );

  return claimed === 1 ? token : null;
}

async function releasePlayerClaims(
  player1: QueuePlayer,
  player2: QueuePlayer,
  token: string,
): Promise<void> {
  await redis.eval(
    `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      redis.call("del", KEYS[1])
    end
    if redis.call("get", KEYS[2]) == ARGV[1] then
      redis.call("del", KEYS[2])
    end
    return 0
    `,
    2,
    claimKey(player1.userId),
    claimKey(player2.userId),
    token,
  );
}

function parseQueueEntries(raw: string[]): QueuePlayer[] {
  const players: QueuePlayer[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    players.push({ userId: raw[i], elo: parseInt(raw[i + 1], 10) });
  }
  return players;
}

async function runMatchmaking(matchmakingNs: Namespace, gameNs: Namespace): Promise<void> {
  const lockToken = `${process.pid}:${crypto.randomUUID()}`;
  const lock = await redis.set(LOCK_KEY, lockToken, 'EX', LOCK_TTL_SECONDS, 'NX');
  if (!lock) return;

  try {
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

        const claimToken = await claimPlayers(player, opponent);
        if (!claimToken) continue;

        try {
          await createMatch(matchmakingNs, gameNs, player, opponent);
        } finally {
          await releasePlayerClaims(player, opponent, claimToken);
        }
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
  } finally {
    await releaseLock(lockToken);
  }
}

export function startMatchmakingLoop(matchmakingNs: Namespace, gameNs: Namespace): void {
  setInterval(() => {
    runMatchmaking(matchmakingNs, gameNs).catch((err) =>
      console.error('Matchmaking loop error:', err),
    );
  }, 2000);
}
