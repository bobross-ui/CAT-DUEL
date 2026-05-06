import { CorsOptions } from 'cors';
import { env } from './env';

const allowedOrigins = env.ALLOWED_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isLocalhostOrigin(origin: string): boolean {
  if (env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin) || isLocalhostOrigin(origin);
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
};

export const socketCorsOptions = {
  origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    callback(null, isAllowedOrigin(origin));
  },
};
