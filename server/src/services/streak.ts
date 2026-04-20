import { redis } from '../config/redis';
import { prisma } from '../models/prisma';

export function startOfUtcDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

function sameUtcDay(a: Date, b: Date): boolean {
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

function isUtcYesterday(date: Date, today: Date): boolean {
  const previous = startOfUtcDay(today);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return startOfUtcDay(date).getTime() === previous.getTime();
}

export async function touchStreak(userId: string): Promise<boolean> {
  const cacheKey = `streak:touched:${userId}`;
  const throttled = await redis.get(cacheKey);
  if (throttled) return false;

  const today = startOfUtcDay(new Date());

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      currentStreak: true,
      longestStreak: true,
      lastActiveDate: true,
    },
  });

  if (!user) return false;

  await redis.set(cacheKey, '1', 'EX', 3600);

  if (user.lastActiveDate && sameUtcDay(user.lastActiveDate, today)) {
    return false;
  }

  const newStreak = user.lastActiveDate && isUtcYesterday(user.lastActiveDate, today)
    ? user.currentStreak + 1
    : 1;

  await prisma.user.update({
    where: { id: userId },
    data: {
      currentStreak: newStreak,
      longestStreak: Math.max(user.longestStreak, newStreak),
      lastActiveDate: today,
    },
  });

  return true;
}
