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

export async function createGameSocket(): Promise<Socket> {
  return createSocket('/game');
}
