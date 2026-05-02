import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import admin from '../config/firebase';
import { redis } from '../config/redis';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../models/prisma';
import { invalidateUserByFirebaseUid, invalidateUserById } from '../services/userCache';

const router = Router();

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
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
    const isOwnProfile = req.user.id === user.id;
    const publicData = {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      eloRating: user.eloRating,
      gamesPlayed: user.gamesPlayed,
      createdAt: user.createdAt,
      ...(isOwnProfile && { email: user.email }),
    };
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ success: true, data: publicData });
  } catch (err) {
    next(err);
  }
});

router.patch('/me', authMiddleware, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const { onboardingCompletedAt, ...profileData } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...profileData,
        ...(onboardingCompletedAt && { onboardingCompletedAt: new Date(onboardingCompletedAt) }),
      },
    });
    await invalidateUserById(req.user.id);
    res.json({ success: true, data: user });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ success: false, error: { code: 'DISPLAY_NAME_TAKEN', message: 'That display name is already taken.' } });
      return;
    }
    next(err);
  }
});

router.delete('/me', authMiddleware, async (req, res, next) => {
  try {
    const activeGameId = await redis.get(`active_game:${req.user.id}`);
    if (activeGameId) {
      res.status(409).json({
        success: false,
        error: { code: 'ACTIVE_MATCH', message: 'Finish your current match first.' },
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.matchAnswer.deleteMany({
        where: {
          match: {
            OR: [
              { player1Id: req.user.id },
              { player2Id: req.user.id },
            ],
          },
        },
      });
      await tx.practiceAnswer.deleteMany({ where: { userId: req.user.id } });
      await tx.match.deleteMany({
        where: {
          OR: [
            { player1Id: req.user.id },
            { player2Id: req.user.id },
          ],
        },
      });
      await tx.user.delete({ where: { id: req.user.id } });
    });

    await invalidateUserByFirebaseUid(req.user.firebaseUid);
    await admin.auth().deleteUser(req.user.firebaseUid);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
