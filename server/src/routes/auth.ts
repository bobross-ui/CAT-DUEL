import { Router } from 'express';
import { Prisma } from '../generated/prisma/client';
import admin from '../config/firebase';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../models/prisma';
import { displayNameSchema } from '../services/displayName';
import { cacheUser, getCachedUserByFirebaseUid } from '../services/userCache';
import { startOfUtcDay } from '../services/streak';
import { z } from 'zod';

const router = Router();

const bootstrapSchema = z.object({
  displayName: displayNameSchema.optional(),
});

router.post('/bootstrap', validate(bootstrapSchema), async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(token, true).catch(() => null);
    if (!decoded) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
      return;
    }

    const existingUser = await getCachedUserByFirebaseUid(decoded.uid);
    if (existingUser) {
      res.json({ success: true, data: existingUser });
      return;
    }

    try {
      const user = await prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: decoded.email ?? '',
          displayName: req.body.displayName ?? decoded.name ?? null,
          avatarUrl: decoded.picture ?? null,
        },
      });
      await cacheUser(user);

      res.status(201).json({ success: true, data: user });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const user = await getCachedUserByFirebaseUid(decoded.uid);
        if (user) {
          res.json({ success: true, data: user });
          return;
        }

        await admin.auth().deleteUser(decoded.uid).catch((deleteError) => {
          req.log.error({ err: deleteError }, 'auth/bootstrap: failed to clean up Firebase user after bootstrap conflict');
        });
        res.status(409).json({
          success: false,
          error: { code: 'DISPLAY_NAME_TAKEN', message: 'That display name is already taken.' },
        });
        return;
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const dayStart = startOfUtcDay(new Date());
    const matches = await prisma.match.findMany({
      where: {
        finishedAt: { gte: dayStart },
        OR: [
          { player1Id: req.user.id },
          { player2Id: req.user.id },
        ],
      },
      select: {
        player1Id: true,
        player2Id: true,
        player1EloChange: true,
        player2EloChange: true,
      },
    });

    const ratingChangeToday = matches.reduce((sum, match) => {
      if (match.player1Id === req.user.id) return sum + match.player1EloChange;
      if (match.player2Id === req.user.id) return sum + match.player2EloChange;
      return sum;
    }, 0);

    res.json({
      success: true,
      data: {
        ...req.user,
        ratingChangeToday,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
