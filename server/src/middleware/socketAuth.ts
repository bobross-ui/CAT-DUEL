import { Socket } from 'socket.io';
import admin from '../config/firebase';
import { registerSocketConnection } from '../services/socketRateLimit';
import { getCachedUserByFirebaseUid, isFirebaseUidBlocked } from '../services/userCache';

export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('UNAUTHORIZED'));

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (await isFirebaseUidBlocked(decoded.uid)) return next(new Error('UNAUTHORIZED'));
    const user = await getCachedUserByFirebaseUid(decoded.uid);
    if (!user) return next(new Error('USER_NOT_FOUND'));
    const accepted = await registerSocketConnection(user.id, socket);
    if (!accepted) return next(new Error('TOO_MANY_CONNECTIONS'));
    socket.data.user = user;
    next();
  } catch {
    next(new Error('INVALID_TOKEN'));
  }
}
