import { Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore, RedisReply } from 'rate-limit-redis';
import { redis } from '../config/redis';

const rateLimitResponse = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
};

function sendRedisCommand(command: string, ...args: string[]) {
  return redis.call(command, ...args) as Promise<RedisReply>;
}

function userKey(req: Request): string {
  const user = (req as Request & { user?: { id: string } }).user;
  return user?.id ? `user:${user.id}` : `ip:${req.ip ?? 'unknown'}`;
}

function ipKey(req: Request): string {
  return `ip:${req.ip ?? 'unknown'}`;
}

function createRateLimit(
  prefix: string,
  windowMs: number,
  limit: number,
  keyGenerator: (req: Request) => string,
  options: { skipFailedRequests?: boolean } = {},
) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    store: new RedisStore({
      prefix,
      sendCommand: sendRedisCommand,
    }),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (request) => request.method === 'OPTIONS',
    skipFailedRequests: options.skipFailedRequests,
    message: rateLimitResponse,
  });
}

export const unauthenticatedGlobalRateLimit = createRateLimit(
  'rate:rest:ip-global:',
  5 * 60_000,
  600,
  ipKey,
);

export const authenticatedGlobalRateLimit = createRateLimit(
  'rate:rest:user-global:',
  5 * 60_000,
  600,
  userKey,
);

export const updateProfileRateLimit = createRateLimit(
  'rate:rest:update-profile:',
  60 * 60_000,
  5,
  userKey,
);

export const deleteAccountRateLimit = createRateLimit(
  'rate:rest:delete-account:',
  24 * 60 * 60_000,
  1,
  userKey,
  { skipFailedRequests: true },
);

export const practiceAnswerRateLimit = createRateLimit(
  'rate:rest:practice-answer:',
  60_000,
  60,
  userKey,
);
