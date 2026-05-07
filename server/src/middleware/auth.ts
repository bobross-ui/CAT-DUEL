import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebase';
import { touchStreak } from '../services/streak';
import { getCachedUserByFirebaseUid } from '../services/userCache';
import { authenticatedGlobalRateLimit } from './rateLimit';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token, true).catch(() => null);
    if (!decoded) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
      return;
    }

    const user = await getCachedUserByFirebaseUid(decoded.uid);
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    req.user = user;
    authenticatedGlobalRateLimit(req, res, (rateLimitErr) => {
      if (rateLimitErr) {
        next(rateLimitErr);
        return;
      }

      void touchStreak(user.id).catch((error) => {
        console.error('[authMiddleware] touchStreak failed:', error);
      });

      next();
    });
  } catch (err) {
    next(err);
  }
}
