import { createServer } from 'http';
import type { Socket as NetSocket } from 'net';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from './config/env';
import { corsOptions, socketCorsOptions } from './config/cors';
import { redis, verifyRedisConnection } from './config/redis';
import { prisma } from './models/prisma';
import { unauthenticatedGlobalRateLimit } from './middleware/rateLimit';
import { socketAuthMiddleware } from './middleware/socketAuth';
import { registerMatchmakingHandlers } from './services/matchmaking';
import { startMatchmakingLoop, stopMatchmakingLoop } from './services/matchmakingLoop';
import { registerGameHandlers, recoverActiveGames } from './services/gameSession';
import { startQuestionServeCountFlush, stopQuestionServeCountFlush, flushQuestionServeCounts } from './services/questionServeBuffer';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import adminRouter from './routes/admin';
import questionsRouter from './routes/questions';
import gamesRouter from './routes/games';
import leaderboardRouter from './routes/leaderboard';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const httpServer = createServer(app);

// --- Socket.io ---
export const io = new Server(httpServer, {
  cors: socketCorsOptions,
  pingInterval: 10000,
  pingTimeout: 5000,
});

export const matchmakingNs = io.of('/matchmaking');
export const gameNs = io.of('/game');

matchmakingNs.use(socketAuthMiddleware);
gameNs.use(socketAuthMiddleware);

// --- Track open / busy sockets for graceful HTTP drain ---
let shuttingDown = false;
const openSockets = new Set<NetSocket>();
const busySockets = new WeakSet<NetSocket>();

httpServer.on('connection', (socket: NetSocket) => {
  openSockets.add(socket);
  socket.on('close', () => openSockets.delete(socket));
});

httpServer.on('request', (req, res) => {
  busySockets.add(req.socket);
  res.on('finish', () => {
    busySockets.delete(req.socket);
    if (shuttingDown) req.socket.destroy();
  });
});

// --- Express middleware ---
app.use((_, res, next) => {
  if (shuttingDown) res.setHeader('Connection', 'close');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));
app.use(cors(corsOptions));
app.use(unauthenticatedGlobalRateLimit);
app.use(express.json({ limit: '32kb' }));

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/games', gamesRouter);
app.use('/api/leaderboard', leaderboardRouter);

app.use(errorHandler);

// --- Graceful shutdown ---
async function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  const hardExit = setTimeout(() => {
    console.error('Graceful shutdown timed out after 30s, forcing exit');
    process.exit(1);
  }, 30_000);
  hardExit.unref();

  try {
    // 1. Stop accepting new HTTP connections; destroy idle keep-alive sockets
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      for (const socket of openSockets) {
        if (!busySockets.has(socket)) socket.destroy();
      }
    });

    // 2. Disconnect all Socket.io clients then close the server
    io.disconnectSockets(true);
    await io.close();

    // 3. Stop background loops
    stopMatchmakingLoop();
    stopQuestionServeCountFlush();

    // 4. Final flush so buffered serve counts land in Postgres
    await flushQuestionServeCounts();

    // 5. Disconnect from DB and Redis
    await prisma.$disconnect();
    await redis.quit();

    clearTimeout(hardExit);
    console.log('Graceful shutdown complete');
    process.exit(exitCode);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());

process.on('uncaughtException', (err) => {
  console.error({ err, type: 'uncaughtException' }, 'Uncaught exception — shutting down');
  shutdown(1);
});

process.on('unhandledRejection', (reason) => {
  console.error({ reason, type: 'unhandledRejection' }, 'Unhandled rejection — shutting down');
  shutdown(1);
});

async function startServer(): Promise<void> {
  await verifyRedisConnection();

  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  registerMatchmakingHandlers(matchmakingNs);
  registerGameHandlers(gameNs);

  if (env.RUN_BACKGROUND_JOBS) {
    await recoverActiveGames(gameNs);
    startMatchmakingLoop(matchmakingNs, gameNs);
    startQuestionServeCountFlush();
  }

  httpServer.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
