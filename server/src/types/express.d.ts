import type { User } from '../generated/prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';

declare global {
  namespace Express {
    interface Request {
      user: User;
      firebaseToken: DecodedIdToken;
    }
  }
}

export {};
