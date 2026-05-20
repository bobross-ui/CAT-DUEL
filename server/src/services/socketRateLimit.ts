import { Socket } from 'socket.io';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { redis } from '../config/redis';
import { logger } from '../lib/logger';

const MAX_CONCURRENT_SOCKETS = 3;
// 5-min TTL: self-heals after crashes/restarts without blocking users for 20+ minutes
const SOCKET_CONNECTION_TTL_SECONDS = 5 * 60;

const socketEventLimiters = {
  'queue:join': new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rate:socket:event:queue-join',
    points: 10,
    duration: 60,
    rejectIfRedisNotReady: true,
  }),
  'queue:leave': new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rate:socket:event:queue-leave',
    points: 20,
    duration: 60,
    rejectIfRedisNotReady: true,
  }),
  'game:join': new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rate:socket:event:game-join',
    points: 20,
    duration: 60,
    rejectIfRedisNotReady: true,
  }),
  'answer:submit': new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rate:socket:event:answer-submit',
    points: 60,
    duration: 60,
    rejectIfRedisNotReady: true,
  }),
  'question:skip': new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rate:socket:event:question-skip',
    points: 60,
    duration: 60,
    rejectIfRedisNotReady: true,
  }),
  'question:jump': new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rate:socket:event:question-jump',
    points: 60,
    duration: 60,
    rejectIfRedisNotReady: true,
  }),
  'guest:start': new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rate:socket:event:guest-start',
    points: 5,
    duration: 60,
    rejectIfRedisNotReady: true,
  }),
};

type SocketLimitedEvent = keyof typeof socketEventLimiters;

export async function registerSocketConnection(userId: string, socket: Socket): Promise<boolean> {
  const key = `socket:conn:${userId}`;

  await redis.sadd(key, socket.id);
  await redis.expire(key, SOCKET_CONNECTION_TTL_SECONDS);
  const count = await redis.scard(key);

  if (count > MAX_CONCURRENT_SOCKETS) {
    await redis.srem(key, socket.id);
    return false;
  }

  socket.on('disconnect', () => {
    void redis.srem(key, socket.id).catch((err) =>
      logger.error({ err, userId }, 'socketRateLimit: connection cleanup failed'),
    );
  });

  return true;
}

export async function enforceSocketEventLimit(
  socket: Socket,
  eventName: SocketLimitedEvent,
  userId: string,
): Promise<boolean> {
  const key = `${socket.nsp.name}:${eventName}:${userId}`;

  try {
    await socketEventLimiters[eventName].consume(key);
    return true;
  } catch (err) {
    if (!(err instanceof RateLimiterRes)) {
      throw err;
    }

    socket.emit('rate:limited', { event: eventName });
    socket.disconnect(true);
    return false;
  }
}
