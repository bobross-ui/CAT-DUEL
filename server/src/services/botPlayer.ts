import { redis } from '../config/redis';
import type { User } from '../generated/prisma/client';
import { prisma } from '../models/prisma';

const BOT_BUSY_TTL_SECONDS = 60;

export function botBusyKey(botId: string): string {
  return `bot_busy:${botId}`;
}

function activeGameKey(userId: string): string {
  return `active_game:${userId}`;
}

function pendingMatchKey(userId: string): string {
  return `pending_match:${userId}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function byClosestElo(humanElo: number): (a: User, b: User) => number {
  return (a, b) => {
    const distance = Math.abs(a.eloRating - humanElo) - Math.abs(b.eloRating - humanElo);
    return distance || a.eloRating - b.eloRating;
  };
}

export async function getBotForPlayer(humanElo: number): Promise<User | null> {
  const candidates = await prisma.user.findMany({
    where: {
      isBot: true,
      deletedAt: null,
    },
  });

  if (candidates.length === 0) return null;

  const sortedCandidates = [...candidates].sort(byClosestElo(humanElo));
  const availabilityKeys = sortedCandidates.flatMap((bot) => [
    activeGameKey(bot.id),
    pendingMatchKey(bot.id),
    botBusyKey(bot.id),
  ]);
  const availabilityValues = await redis.mget(...availabilityKeys);

  for (let index = 0; index < sortedCandidates.length; index += 1) {
    const keyOffset = index * 3;
    const isUnavailable = availabilityValues
      .slice(keyOffset, keyOffset + 3)
      .some((value) => value !== null);

    if (isUnavailable) continue;

    const claimed = await redis.set(
      botBusyKey(sortedCandidates[index].id),
      '1',
      'EX',
      BOT_BUSY_TTL_SECONDS,
      'NX',
    );
    if (claimed === 'OK') return sortedCandidates[index];
  }

  return null;
}

export function rollBotCorrect(humanElo: number, botElo: number): boolean {
  const probability = clamp(0.5 + (botElo - humanElo) / 800, 0.2, 0.8);
  return Math.random() < probability;
}
