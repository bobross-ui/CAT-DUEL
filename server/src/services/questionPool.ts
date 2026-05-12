import { redis } from '../config/redis';
import { prisma } from '../models/prisma';
import { logger } from '../lib/logger';

const POOL_TTL = 10 * 60;       // 10 minutes
export const CONTENT_TTL = 24 * 60 * 60; // 24 hours
const QUESTION_CATEGORIES = ['QUANT', 'DILR', 'VARC'] as const;

const poolKey = (category: string) => `qpool:${category}`;
export const contentKey = (id: string) => `qcontent:${id}`;

export interface CachedQuestion {
  id: string;
  category: string;
  questionType: string;
  subTopic: string | null;
  subType: string | null;
  difficulty: number;
  text: string;
  options: unknown;
  correctAnswer: number | null;
  correctAnswerText: string | null;
  passageId: string | null;
  passage: { id: string; text: string } | null;
}

interface QuestionPoolEntry {
  id: string;
  category: string;
  difficulty: number;
  isVerified: boolean;
}

export async function warmQuestionPool(): Promise<void> {
  const questions = await prisma.question.findMany({
    where: { isVerified: true },
    select: { id: true, category: true, difficulty: true },
  });

  const byCategory: Record<string, { id: string; difficulty: number }[]> = {};
  for (const q of questions) {
    (byCategory[q.category] ??= []).push(q);
  }

  await Promise.all(
    QUESTION_CATEGORIES.map((category) => {
      const key = poolKey(category);
      const qs = byCategory[category] ?? [];
      if (qs.length === 0) return redis.del(key);

      const tempKey = `${key}:tmp:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const args: (string | number)[] = [];
      for (const q of qs) args.push(q.difficulty, q.id);

      return redis
        .pipeline()
        .del(tempKey)
        .zadd(tempKey, ...args)
        .expire(tempKey, POOL_TTL)
        .rename(tempKey, key)
        .expire(key, POOL_TTL)
        .exec();
    }),
  );
}

export async function syncQuestionPoolEntry(question: QuestionPoolEntry): Promise<void> {
  try {
    const pipeline = redis.pipeline().del(contentKey(question.id));

    if (question.isVerified) {
      pipeline
        .zadd(poolKey(question.category), question.difficulty, question.id)
        .expire(poolKey(question.category), POOL_TTL);
    } else {
      pipeline.zrem(poolKey(question.category), question.id);
    }

    await pipeline.exec();
  } catch (err) {
    logger.error({ err, questionId: question.id }, 'questionPool: sync entry failed');
  }
}

export async function removeQuestionFromPool(question: { id: string; category: string }): Promise<void> {
  try {
    await redis
      .pipeline()
      .del(contentKey(question.id))
      .zrem(poolKey(question.category), question.id)
      .exec();
  } catch (err) {
    logger.error({ err, questionId: question.id }, 'questionPool: remove entry failed');
  }
}

export async function getPoolIds(
  category: string,
  minDiff: number,
  maxDiff: number,
): Promise<string[]> {
  return redis.zrangebyscore(poolKey(category), minDiff, maxDiff);
}

export async function getQuestionsContent(
  ids: string[],
): Promise<Map<string, CachedQuestion>> {
  if (ids.length === 0) return new Map();

  const keys = ids.map(contentKey);
  const cached = await redis.mget(...keys);

  const result = new Map<string, CachedQuestion>();
  const misses: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    if (cached[i]) {
      result.set(ids[i], JSON.parse(cached[i]!) as CachedQuestion);
    } else {
      misses.push(ids[i]);
    }
  }

  if (misses.length > 0) {
    const rows = await prisma.question.findMany({
      where: { id: { in: misses }, isVerified: true },
      select: {
        id: true,
        category: true,
        questionType: true,
        subTopic: true,
        subType: true,
        difficulty: true,
        text: true,
        options: true,
        correctAnswer: true,
        correctAnswerText: true,
        passageId: true,
        passage: { select: { id: true, text: true } },
      },
    });

    const pipeline = redis.pipeline();
    for (const row of rows) {
      const q: CachedQuestion = { ...row, passage: row.passage ?? null };
      result.set(row.id, q);
      pipeline.set(contentKey(row.id), JSON.stringify(q), 'EX', CONTENT_TTL);
    }
    await pipeline.exec();
  }

  return result;
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startQuestionPoolRefresh(): void {
  warmQuestionPool().catch((err) =>
    logger.error({ err }, 'questionPool: initial warm failed'),
  );
  refreshInterval = setInterval(
    () => warmQuestionPool().catch((err) =>
      logger.error({ err }, 'questionPool: refresh failed'),
    ),
    5 * 60 * 1000,
  );
}

export function stopQuestionPoolRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
