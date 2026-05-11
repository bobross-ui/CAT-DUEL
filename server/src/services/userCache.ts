import type { User } from '../generated/prisma/client';
import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import { logger } from '../lib/logger';

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
    deletedAt: string | null;
  };

  return {
    ...user,
    draws: user.draws ?? 0,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
    lastActiveDate: user.lastActiveDate ? new Date(user.lastActiveDate) : null,
    onboardingCompletedAt: user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt) : null,
    deletedAt: user.deletedAt ? new Date(user.deletedAt) : null,
  };
}

export async function getCachedUserByFirebaseUid(firebaseUid: string): Promise<User | null> {
  const key = userCacheKey(firebaseUid);

  try {
    const cached = await redis.get(key);
    if (cached) return reviveUser(cached);
  } catch (err) {
    logger.error({ err }, 'userCache: get failed');
  }

  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) return null;

  try {
    await redis.set(key, JSON.stringify(user), 'EX', USER_CACHE_TTL_SECONDS);
  } catch (err) {
    logger.error({ err }, 'userCache: set failed');
  }

  return user;
}

export async function cacheUser(user: User): Promise<void> {
  try {
    await redis.set(userCacheKey(user.firebaseUid), JSON.stringify(user), 'EX', USER_CACHE_TTL_SECONDS);
  } catch (err) {
    logger.error({ err }, 'userCache: set failed');
  }
}

export async function invalidateUserByFirebaseUid(firebaseUid: string): Promise<void> {
  try {
    await redis.del(userCacheKey(firebaseUid));
  } catch (err) {
    logger.error({ err }, 'userCache: invalidate failed');
  }
}

export async function invalidateUserById(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firebaseUid: true },
  });

  if (user) await invalidateUserByFirebaseUid(user.firebaseUid);
}

const REVOKED_KEY = 'revoked:firebase_uids';

export async function blockFirebaseUid(firebaseUid: string): Promise<void> {
  try {
    await redis.sadd(REVOKED_KEY, firebaseUid);
  } catch (err) {
    logger.error({ err }, 'userCache: blockFirebaseUid failed');
  }
}

export async function isFirebaseUidBlocked(firebaseUid: string): Promise<boolean> {
  try {
    return (await redis.sismember(REVOKED_KEY, firebaseUid)) === 1;
  } catch (err) {
    logger.error({ err }, 'userCache: isFirebaseUidBlocked failed');
    return false;
  }
}
