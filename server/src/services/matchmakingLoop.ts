import type { Namespace } from 'socket.io';
import { redis } from '../config/redis';
import { createMatch } from './matchmaking';
import type { QueuePlayer } from './matchmaking';
import { logger } from '../lib/logger';
import { Sentry } from '../lib/sentry';

const INITIAL_RANGE = 150;
const EXPANDED_RANGE = 300;
const EXPAND_AFTER_MS = 30_000;
const TIMEOUT_MS = 60_000;
const CLAIM_TTL_SECONDS = 30;
const LOOP_INTERVAL_MS = 2_000;
const DUE_BATCH_SIZE = 100;
const CANDIDATE_SEARCH_LIMIT = 50;
const QUEUE_KEY = 'matchmaking_queue';
const QUEUE_DUE_KEY = 'matchmaking_queue_due';

function claimKey(userId: string): string {
  return `matchmaking:claim:${userId}`;
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
    redis.call("zrem", KEYS[4], ARGV[1], ARGV[2])
    return 1
    `,
    4,
    claimKey(player1.userId),
    claimKey(player2.userId),
    QUEUE_KEY,
    QUEUE_DUE_KEY,
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

async function removeQueuedPlayer(userId: string): Promise<void> {
  await redis.zrem(QUEUE_KEY, userId);
  await redis.zrem(QUEUE_DUE_KEY, userId);
  await redis.del(
    `queue_joined:${userId}`,
    `socket:mm:${userId}`,
  );
}

function parseQueueEntries(raw: string[], player: QueuePlayer, matched: Set<string>): QueuePlayer[] {
  const players: QueuePlayer[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const userId = raw[i];
    const elo = parseInt(raw[i + 1], 10);
    if (
      userId === player.userId ||
      matched.has(userId) ||
      Number.isNaN(elo)
    ) {
      continue;
    }
    players.push({ userId, elo });
  }
  return players;
}

function nextAttemptAt(joinedAt: number, now: number): number {
  const expandAt = joinedAt + EXPAND_AFTER_MS + 1;
  const timeoutAt = joinedAt + TIMEOUT_MS + 1;

  if (now < expandAt) return expandAt;
  return Math.min(now + LOOP_INTERVAL_MS, timeoutAt);
}

async function findCandidates(
  player: QueuePlayer,
  range: number,
  matched: Set<string>,
): Promise<QueuePlayer[]> {
  const [lowerRaw, upperRaw] = await Promise.all([
    redis.zrevrangebyscore(
      QUEUE_KEY,
      player.elo,
      player.elo - range,
      'WITHSCORES',
      'LIMIT',
      0,
      CANDIDATE_SEARCH_LIMIT,
    ),
    redis.zrangebyscore(
      QUEUE_KEY,
      player.elo,
      player.elo + range,
      'WITHSCORES',
      'LIMIT',
      0,
      CANDIDATE_SEARCH_LIMIT,
    ),
  ]);

  const candidatesById = new Map<string, QueuePlayer>();
  for (const candidate of [
    ...parseQueueEntries(lowerRaw, player, matched),
    ...parseQueueEntries(upperRaw, player, matched),
  ]) {
    candidatesById.set(candidate.userId, candidate);
  }

  return Array.from(candidatesById.values()).sort(
    (a, b) => Math.abs(a.elo - player.elo) - Math.abs(b.elo - player.elo),
  );
}

export async function runMatchmaking(matchmakingNs: Namespace, gameNs: Namespace): Promise<void> {
  const now = Date.now();
  const dueUserIds = await redis.zrangebyscore(
    QUEUE_DUE_KEY,
    '-inf',
    now,
    'LIMIT',
    0,
    DUE_BATCH_SIZE,
  );
  if (dueUserIds.length === 0) return;

  const matched = new Set<string>();

  for (const userId of dueUserIds) {
    if (matched.has(userId)) continue;

    const [eloScore, joinedAtValue] = await Promise.all([
      redis.zscore(QUEUE_KEY, userId),
      redis.get(`queue_joined:${userId}`),
    ]);
    const elo = eloScore ? parseInt(eloScore, 10) : NaN;
    const joinedAt = joinedAtValue ? parseInt(joinedAtValue, 10) : NaN;
    if (Number.isNaN(elo) || Number.isNaN(joinedAt)) {
      await removeQueuedPlayer(userId);
      continue;
    }

    const player = { userId, elo };
    const waitTime = now - joinedAt;
    const range = waitTime > EXPAND_AFTER_MS ? EXPANDED_RANGE : INITIAL_RANGE;
    const candidates = await findCandidates(player, range, matched);

    if (candidates.length > 0) {
      const opponent = candidates[0];

      const claimToken = await claimPlayers(player, opponent);
      if (!claimToken) continue;
      matched.add(player.userId);
      matched.add(opponent.userId);

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
      await removeQueuedPlayer(player.userId);
    } else {
      await redis.zadd(QUEUE_DUE_KEY, nextAttemptAt(joinedAt, now), player.userId);
    }
  }
}

let matchmakingTimer: ReturnType<typeof setInterval> | null = null;

export function startMatchmakingLoop(matchmakingNs: Namespace, gameNs: Namespace): void {
  matchmakingTimer = setInterval(() => {
    runMatchmaking(matchmakingNs, gameNs).catch((err) => {
      Sentry.captureException(err);
      logger.error({ err }, 'Matchmaking loop error');
    });
  }, LOOP_INTERVAL_MS);
}

export function stopMatchmakingLoop(): void {
  if (matchmakingTimer) {
    clearInterval(matchmakingTimer);
    matchmakingTimer = null;
  }
}
