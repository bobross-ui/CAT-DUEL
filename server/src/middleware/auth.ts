import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebase';
import { prisma } from '../models/prisma';
import { touchStreak } from '../services/streak';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    let user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: decoded.email ?? '',
          displayName: decoded.name ?? null,
          avatarUrl: decoded.picture ?? null,
        },
      });
    }

    const streakUpdated = await touchStreak(user.id).catch((error) => {
      console.error('[authMiddleware] touchStreak failed:', error);
      return false;
    });

    if (streakUpdated) {
      const refreshedUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (refreshedUser) user = refreshedUser;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
}
