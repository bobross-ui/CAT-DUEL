import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';

const RESERVED_DISPLAY_NAMES = new Set([
  'admin',
  'moderator',
  'support',
  'anonymous',
  'deleted player',
  'system',
  'bot',
]);

const DISPLAY_NAME_PATTERN = /^[\p{Script=Latin}\p{Script=Devanagari}\p{N} _\-.]+$/u;

export const DELETED_PLAYER_NAME = 'Deleted player';
export const DISPLAY_CODE_MAX_ATTEMPTS = 10;

export const displayNameSchema = z.string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(30, 'Name must be 30 characters or less.')
  .transform((value) => value.normalize('NFKC'))
  .refine((value) => value.trim().length > 0, 'Name cannot be blank.')
  .refine((value) => DISPLAY_NAME_PATTERN.test(value), 'Use letters, numbers, spaces, underscores, hyphens, or dots only.')
  .refine((value) => !RESERVED_DISPLAY_NAMES.has(value.toLowerCase()), 'That name is reserved.');

export function generateDisplayCode(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

export function isDisplayCodeUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.some((field) => String(field).includes('display_code'));
  if (typeof target === 'string') return target.includes('display_code');
  return false;
}

export function publicDisplayName(user: {
  displayName: string | null;
  displayCode?: string | null;
  deletedAt?: Date | string | null;
  isBot?: boolean;
  isGuest?: boolean;
}) {
  if (user.deletedAt) return DELETED_PLAYER_NAME;
  if (!user.displayName) return 'Anonymous';
  if (user.displayCode && !user.isBot && !user.isGuest) return `${user.displayName}#${user.displayCode}`;
  return user.displayName;
}
