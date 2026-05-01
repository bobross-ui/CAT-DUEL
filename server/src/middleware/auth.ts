import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebase';
import { prisma } from '../models/prisma';
import { touchStreak } from '../services/streak';
import { cacheUser, getCachedUserByFirebaseUid } from '../services/userCache';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    let user = await getCachedUserByFirebaseUid(decoded.uid);
    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: decoded.email ?? '',
          displayName: decoded.name ?? null,
          avatarUrl: decoded.picture ?? null,
        },
      });
      await cacheUser(user);
    }

    void touchStreak(user.id).catch((error) => {
      console.error('[authMiddleware] touchStreak failed:', error);
    });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
}
