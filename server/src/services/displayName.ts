import { z } from 'zod';

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

export const displayNameSchema = z.string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(30, 'Name must be 30 characters or less.')
  .transform((value) => value.normalize('NFKC'))
  .refine((value) => value.trim().length > 0, 'Name cannot be blank.')
  .refine((value) => DISPLAY_NAME_PATTERN.test(value), 'Use letters, numbers, spaces, underscores, hyphens, or dots only.')
  .refine((value) => !RESERVED_DISPLAY_NAMES.has(value.toLowerCase()), 'That name is reserved.');

export function publicDisplayName(user: { displayName: string | null; deletedAt?: Date | string | null }) {
  if (user.deletedAt) return DELETED_PLAYER_NAME;
  return user.displayName ?? 'Anonymous';
}
