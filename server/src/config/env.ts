import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  REDIS_TLS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).transform((key) => key.replace(/\\n/g, '\n')),
  ALLOWED_ORIGINS: z.string().min(1),
  GAME_DURATION_SECONDS: z.coerce.number().int().positive().default(600),
  RUN_BACKGROUND_JOBS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
  ALLOW_PROD_SEED: z.enum(['true', 'false']).default('false'),
}).superRefine((values, ctx) => {
  if (values.NODE_ENV !== 'production') {
    return;
  }

  if (!values.REDIS_URL.startsWith('rediss://')) {
    ctx.addIssue({
      code: 'custom',
      path: ['REDIS_URL'],
      message: 'REDIS_URL must start with rediss:// in production',
    });
  }

  if (values.ALLOWED_ORIGINS.split(',').some((origin) => origin.trim() === '*')) {
    ctx.addIssue({
      code: 'custom',
      path: ['ALLOWED_ORIGINS'],
      message: 'ALLOWED_ORIGINS cannot contain * in production',
    });
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const errors = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid server environment:\n${errors}`);
}

export const env = parsedEnv.data;
