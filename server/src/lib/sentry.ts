import * as Sentry from '@sentry/node';
import { expressIntegration } from '@sentry/node';
import { env } from '../config/env';

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [expressIntegration()],
  });
}

export function withSentry<T extends unknown[]>(
  fn: (...args: T) => Promise<unknown> | unknown,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    }
  };
}

export { Sentry };
export { setupExpressErrorHandler } from '@sentry/node';
