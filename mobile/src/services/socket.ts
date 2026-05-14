import { io, Socket } from 'socket.io-client';
import { auth } from '../config/firebase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

function createSocket(namespace: string): Socket {
  const socket = io(`${API_URL}${namespace}`, {
    auth: (cb) => {
      auth.currentUser
        ?.getIdToken()
        .then((token) => cb({ token }))
        .catch(() => cb({ token: '' }));
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect_error', async (err: Error & { data?: { code?: string } }) => {
    const code = err.data?.code ?? err.message;
    if (code === 'INVALID_TOKEN') {
      try {
        await auth.currentUser?.getIdToken(true); // force refresh
        socket.connect();
      } catch {
        // user is signed out; let upstream code handle it
      }
    }
  });

  return socket;
}

export async function createMatchmakingSocket(): Promise<Socket> {
  return createSocket('/matchmaking');
}

let _gameSocketPromise: Promise<Socket> | null = null;

export async function getGameSocket(): Promise<Socket> {
  if (!_gameSocketPromise) _gameSocketPromise = Promise.resolve(createSocket('/game'));
  return _gameSocketPromise;
}

export function releaseGameSocket(): void {
  _gameSocketPromise = null;
}

export async function disconnectGameSocket(): Promise<void> {
  if (!_gameSocketPromise) return;
  const socket = await _gameSocketPromise;
  socket.disconnect();
  _gameSocketPromise = null;
}
