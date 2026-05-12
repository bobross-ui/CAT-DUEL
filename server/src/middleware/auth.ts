import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebase';
import { touchStreak } from '../services/streak';
import { getCachedUserByFirebaseUid, isFirebaseUidBlocked } from '../services/userCache';
import { authenticatedGlobalRateLimit } from './rateLimit';

const BEARER_PREFIX = 'Bearer ';

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith(BEARER_PREFIX)) return null;

  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  return token || null;
}

function sendUnauthorized(res: Response, message: string) {
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message } });
}

async function verifyFirebaseIdToken(token: string, checkRevoked = false) {
  try {
    const firebaseAuth = admin.auth();
    return checkRevoked
      ? await firebaseAuth.verifyIdToken(token, true)
      : await firebaseAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    sendUnauthorized(res, 'Missing token');
    return;
  }

  try {
    const decoded = await verifyFirebaseIdToken(token);
    if (!decoded) {
      sendUnauthorized(res, 'Invalid token');
      return;
    }

    if (await isFirebaseUidBlocked(decoded.uid)) {
      sendUnauthorized(res, 'Token revoked');
      return;
    }

    const user = await getCachedUserByFirebaseUid(decoded.uid);
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    req.user = user;
    req.firebaseToken = decoded;
    authenticatedGlobalRateLimit(req, res, (rateLimitErr) => {
      if (rateLimitErr) {
        next(rateLimitErr);
        return;
      }

      void touchStreak(user.id).catch((error) => {
        req.log.error({ err: error }, 'authMiddleware: touchStreak failed');
      });

      next();
    });
  } catch (err) {
    next(err);
  }
}

export async function requireFirebaseRevocationCheck(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token || !req.firebaseToken) {
    sendUnauthorized(res, 'Missing token');
    return;
  }

  const decoded = await verifyFirebaseIdToken(token, true);
  if (!decoded || decoded.uid !== req.firebaseToken.uid) {
    sendUnauthorized(res, 'Token revoked');
    return;
  }

  req.firebaseToken = decoded;
  next();
}
