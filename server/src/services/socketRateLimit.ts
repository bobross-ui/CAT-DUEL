import { Socket } from 'socket.io';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { redis } from '../config/redis';

const MAX_CONCURRENT_SOCKETS = 3;
const SOCKET_CONNECTION_TTL_SECONDS = 20 * 60;

const socketConnectionLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rate:socket:connections',
  points: MAX_CONCURRENT_SOCKETS,
  duration: SOCKET_CONNECTION_TTL_SECONDS,
  rejectIfRedisNotReady: true,
});

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
};

type SocketLimitedEvent = keyof typeof socketEventLimiters;

export async function registerSocketConnection(userId: string, socket: Socket): Promise<boolean> {
  try {
    await socketConnectionLimiter.consume(userId);
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      return false;
    }
    throw err;
  }

  socket.on('disconnect', () => {
    void socketConnectionLimiter.reward(userId).catch((err) =>
      console.error(`[socketRateLimit] connection cleanup failed [${userId}]:`, err),
    );
  });

  return true;
}

export async function enforceSocketEventLimit(
  socket: Socket,
  eventName: SocketLimitedEvent,
  userId: string,
): Promise<boolean> {
  const key = `${socket.nsp.name}:${eventName}:${userId}:${socket.id}`;

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
