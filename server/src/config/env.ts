import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).transform((key) => key.replace(/\\n/g, '\n')),
  GEMINI_API_KEY: z.string().min(1),
  ALLOWED_ORIGINS: z.string().min(1),
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
