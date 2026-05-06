import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';

export function buildRedisOptions(): RedisOptions {
  const useTls = env.REDIS_TLS || env.REDIS_URL.startsWith('rediss://');

  return {
    lazyConnect: true,
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
    ...(useTls ? { tls: {} } : {}),
  };
}

export const redis = new Redis(env.REDIS_URL, buildRedisOptions());

export async function verifyRedisConnection(): Promise<void> {
  await redis.ping();
}

redis.on('error', (err) => {
  console.error('Redis error:', err);
});
