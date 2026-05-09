import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      '*.password',
      '*.token',
      '*.firebaseIdToken',
      '*.firebasePrivateKey',
    ],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV !== 'production' ? {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  } : {}),
});

interface RequestContext {
  requestId: string;
  log: pino.Logger;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestLogger(): pino.Logger {
  return requestContext.getStore()?.log ?? logger;
}
