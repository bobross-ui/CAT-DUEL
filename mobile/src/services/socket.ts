import { io, Socket } from 'socket.io-client';
import { auth } from '../config/firebase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

async function createSocket(namespace: string): Promise<Socket> {
  const token = await auth.currentUser?.getIdToken();
  return io(`${API_URL}${namespace}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
}

export async function createMatchmakingSocket(): Promise<Socket> {
  return createSocket('/matchmaking');
}

// Shared game socket — created during FoundScreen, reused by DuelScreen.
let _gameSocketPromise: Promise<Socket> | null = null;

export async function getGameSocket(): Promise<Socket> {
  if (!_gameSocketPromise) _gameSocketPromise = createSocket('/game');
  return _gameSocketPromise;
}

export function releaseGameSocket(): void {
  _gameSocketPromise = null;
}
