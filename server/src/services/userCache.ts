import type { User } from '../generated/prisma/client';
import { redis } from '../config/redis';
import { prisma } from '../models/prisma';

const USER_CACHE_TTL_SECONDS = 300;

function userCacheKey(firebaseUid: string): string {
  return `user:firebase:${firebaseUid}`;
}

function reviveUser(raw: string): User {
  const user = JSON.parse(raw) as User & {
    createdAt: string;
    updatedAt: string;
    lastActiveDate: string | null;
    onboardingCompletedAt: string | null;
  };

  return {
    ...user,
    draws: user.draws ?? 0,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
    lastActiveDate: user.lastActiveDate ? new Date(user.lastActiveDate) : null,
    onboardingCompletedAt: user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt) : null,
  };
}

export async function getCachedUserByFirebaseUid(firebaseUid: string): Promise<User | null> {
  const key = userCacheKey(firebaseUid);

  try {
    const cached = await redis.get(key);
    if (cached) return reviveUser(cached);
  } catch (err) {
    console.error('[userCache] get failed:', err);
  }

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) return null;

  try {
    await redis.set(key, JSON.stringify(user), 'EX', USER_CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('[userCache] set failed:', err);
  }

  return user;
}

export async function cacheUser(user: User): Promise<void> {
  try {
    await redis.set(userCacheKey(user.firebaseUid), JSON.stringify(user), 'EX', USER_CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('[userCache] set failed:', err);
  }
}

export async function invalidateUserByFirebaseUid(firebaseUid: string): Promise<void> {
  try {
    await redis.del(userCacheKey(firebaseUid));
  } catch (err) {
    console.error('[userCache] invalidate failed:', err);
  }
}

export async function invalidateUserById(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firebaseUid: true },
  });

  if (user) await invalidateUserByFirebaseUid(user.firebaseUid);
}
