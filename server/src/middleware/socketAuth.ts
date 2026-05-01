import { Socket } from 'socket.io';
import admin from '../config/firebase';
import { getCachedUserByFirebaseUid } from '../services/userCache';

export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('UNAUTHORIZED'));

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const user = await getCachedUserByFirebaseUid(decoded.uid);
    if (!user) return next(new Error('USER_NOT_FOUND'));
    socket.data.user = user;
    next();
  } catch {
    next(new Error('INVALID_TOKEN'));
  }
}
