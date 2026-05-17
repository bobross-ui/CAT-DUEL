import { Router } from 'express';
import { z } from 'zod';
import admin from '../config/firebase';
import { redis } from '../config/redis';
import { authMiddleware, requireFirebaseRevocationCheck } from '../middleware/auth';
import { deleteAccountRateLimit, updateProfileRateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { prisma } from '../models/prisma';
import {
  DISPLAY_CODE_MAX_ATTEMPTS,
  displayNameSchema,
  generateDisplayCode,
  isDisplayCodeUniqueViolation,
  publicDisplayName,
} from '../services/displayName';
import {
  cacheFirebaseUidBlock,
  invalidateUserByFirebaseUid,
  invalidateUserById,
  persistFirebaseUidBlock,
} from '../services/userCache';

const router = Router();
const RECENT_AUTH_SECONDS = 5 * 60;

const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarUrl: z.string().url().optional(),
  onboardingCompletedAt: z.string().datetime().optional(),
});

router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }
    const publicData = {
      id: user.id,
      displayName: publicDisplayName(user),
      avatarUrl: user.avatarUrl,
      eloRating: user.eloRating,
      rankTier: user.rankTier,
      gamesPlayed: user.gamesPlayed,
      wins: user.wins,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
    };
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ success: true, data: publicData });
  } catch (err) {
    next(err);
  }
});

router.patch('/me', authMiddleware, updateProfileRateLimit, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const { onboardingCompletedAt, ...profileData } = req.body;
    const data = {
      ...profileData,
      ...(onboardingCompletedAt && { onboardingCompletedAt: new Date(onboardingCompletedAt) }),
    };
    let user = null;
    if (profileData.displayName !== undefined) {
      for (let attempt = 0; attempt < DISPLAY_CODE_MAX_ATTEMPTS; attempt += 1) {
        try {
          user = await prisma.user.update({
            where: { id: req.user.id },
            data: { ...data, displayCode: generateDisplayCode() },
          });
          break;
        } catch (err) {
          if (isDisplayCodeUniqueViolation(err)) continue;
          throw err;
        }
      }
    } else {
      user = await prisma.user.update({
        where: { id: req.user.id },
        data,
      });
    }
    if (!user) {
      res.status(503).json({ success: false, error: { code: 'DISPLAY_CODE_UNAVAILABLE', message: 'Could not allocate a display code. Try again.' } });
      return;
    }
    await invalidateUserById(req.user.id);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

router.delete('/me', authMiddleware, deleteAccountRateLimit, requireFirebaseRevocationCheck, async (req, res, next) => {
  try {
    const authAgeSeconds = Math.floor(Date.now() / 1000) - req.firebaseToken.auth_time;
    if (authAgeSeconds > RECENT_AUTH_SECONDS) {
      res.status(401).json({
        success: false,
        error: {
          code: 'REAUTH_REQUIRED',
          message: 'Please sign in again before deleting your account.',
        },
      });
      return;
    }

    const activeGameId = await redis.get(`active_game:${req.user.id}`);
    if (activeGameId) {
      res.status(409).json({
        success: false,
        error: { code: 'ACTIVE_MATCH', message: 'Finish your current match first.' },
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await persistFirebaseUidBlock(req.user.firebaseUid, tx);
      await tx.practiceAnswer.deleteMany({ where: { userId: req.user.id } });
      await tx.user.update({
        where: { id: req.user.id },
        data: {
          firebaseUid: `deleted:${req.user.firebaseUid}`,
          email: null,
          displayName: null,
          displayCode: null,
          avatarUrl: null,
          deletedAt: new Date(),
        },
      });
    });

    await Promise.all([
      invalidateUserByFirebaseUid(req.user.firebaseUid),
      cacheFirebaseUidBlock(req.user.firebaseUid),
    ]);
    await admin.auth().deleteUser(req.user.firebaseUid);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
