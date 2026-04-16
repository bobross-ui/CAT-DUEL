import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { env } from './config/env';
import { redis } from './config/redis';
import { socketAuthMiddleware } from './middleware/socketAuth';
import { registerMatchmakingHandlers } from './services/matchmaking';
import { startMatchmakingLoop } from './services/matchmakingLoop';
import { registerGameHandlers } from './services/gameSession';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import adminRouter from './routes/admin';
import questionsRouter from './routes/questions';
import gamesRouter from './routes/games';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const httpServer = createServer(app);

// --- Socket.io ---
export const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
});

export const matchmakingNs = io.of('/matchmaking');
export const gameNs = io.of('/game');

matchmakingNs.use(socketAuthMiddleware);
gameNs.use(socketAuthMiddleware);

// Track online users in Redis for both namespaces
function trackOnlineUser(userId: string) {
  return {
    onConnect: () => redis.sadd('online_users', userId),
    onDisconnect: () => redis.srem('online_users', userId),
  };
}

matchmakingNs.on('connection', async (socket) => {
  const { onConnect, onDisconnect } = trackOnlineUser(socket.data.user.id);
  await onConnect();
  socket.on('disconnect', onDisconnect);
});

gameNs.on('connection', async (socket) => {
  const { onConnect, onDisconnect } = trackOnlineUser(socket.data.user.id);
  await onConnect();
  socket.on('disconnect', onDisconnect);
});

registerMatchmakingHandlers(matchmakingNs);
registerGameHandlers(gameNs);
startMatchmakingLoop(matchmakingNs);

// --- Express middleware ---
app.use(cors());
app.use(express.json());

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/games', gamesRouter);

app.use(errorHandler);

httpServer.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
});
