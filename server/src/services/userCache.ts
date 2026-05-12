import type { User } from '../generated/prisma/client';
import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import { logger } from '../lib/logger';

const USER_CACHE_TTL_SECONDS = 300;
const FIREBASE_UID_BLOCK_MISS_TTL_SECONDS = 60;
const FIREBASE_UID_BLOCK_VALUE = '1';

function userCacheKey(firebaseUid: string): string {
  return `user:firebase:${firebaseUid}`;
}

function firebaseUidBlockKey(firebaseUid: string): string {
  return `revoked:firebase_uid:${firebaseUid}`;
}

function firebaseUidBlockMissKey(firebaseUid: string): string {
  return `${firebaseUidBlockKey(firebaseUid)}:miss`;
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

async function isFirebaseUidBlockedInPostgres(firebaseUid: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: number }>>`
    SELECT 1 AS "exists"
    FROM "revoked_firebase_uids"
    WHERE "firebase_uid" = ${firebaseUid}
    LIMIT 1
  `;

  return rows.length > 0;
}

type FirebaseUidBlockStore = Pick<typeof prisma, '$executeRaw'>;

export async function persistFirebaseUidBlock(
  firebaseUid: string,
  store: FirebaseUidBlockStore = prisma,
): Promise<void> {
  await store.$executeRaw`
    INSERT INTO "revoked_firebase_uids" ("firebase_uid")
    VALUES (${firebaseUid})
    ON CONFLICT ("firebase_uid") DO NOTHING
  `;
}

export async function cacheFirebaseUidBlock(firebaseUid: string): Promise<void> {
  try {
    await redis
      .multi()
      .set(firebaseUidBlockKey(firebaseUid), FIREBASE_UID_BLOCK_VALUE)
      .del(firebaseUidBlockMissKey(firebaseUid))
      .exec();
  } catch (err) {
    logger.error({ err }, 'userCache: cacheFirebaseUidBlock failed');
  }
}

export async function blockFirebaseUid(firebaseUid: string): Promise<void> {
  try {
    await persistFirebaseUidBlock(firebaseUid);
  } catch (err) {
    logger.error({ err }, 'userCache: blockFirebaseUid durable write failed');
    throw err;
  }

  await cacheFirebaseUidBlock(firebaseUid);
}

export async function isFirebaseUidBlocked(firebaseUid: string): Promise<boolean> {
  try {
    const [blockedByUidKey, knownMiss] = await redis.mget(
      firebaseUidBlockKey(firebaseUid),
      firebaseUidBlockMissKey(firebaseUid),
    );

    if (blockedByUidKey === FIREBASE_UID_BLOCK_VALUE) return true;
    if (knownMiss === FIREBASE_UID_BLOCK_VALUE) return false;
  } catch (err) {
    logger.error({ err }, 'userCache: isFirebaseUidBlocked failed');
  }

  const isBlocked = await isFirebaseUidBlockedInPostgres(firebaseUid);

  try {
    if (isBlocked) {
      await cacheFirebaseUidBlock(firebaseUid);
    } else {
      await redis.set(
        firebaseUidBlockMissKey(firebaseUid),
        FIREBASE_UID_BLOCK_VALUE,
        'EX',
        FIREBASE_UID_BLOCK_MISS_TTL_SECONDS,
      );
    }
  } catch (err) {
    logger.error({ err }, 'userCache: isFirebaseUidBlocked cache write failed');
  }

  return isBlocked;
}
