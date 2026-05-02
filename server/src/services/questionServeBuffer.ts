import { redis } from '../config/redis';
import { prisma } from '../models/prisma';

const BUFFER_KEY = 'question_served_buffer';
const FLUSH_INTERVAL_MS = 60_000;

function countByQuestionId(questionIds: string[]) {
  const counts = new Map<string, number>();
  for (const questionId of questionIds) {
    counts.set(questionId, (counts.get(questionId) ?? 0) + 1);
  }
  return counts;
}

export async function bufferQuestionServes(questionIds: string[]): Promise<void> {
  const counts = countByQuestionId(questionIds);
  if (counts.size === 0) return;

  const multi = redis.multi();
  for (const [questionId, count] of counts) {
    multi.hincrby(BUFFER_KEY, questionId, count);
  }
  await multi.exec();
}

export async function flushQuestionServeCounts(): Promise<void> {
  const result = await redis.multi().hgetall(BUFFER_KEY).del(BUFFER_KEY).exec();
  const rawCounts = result?.[0]?.[1] as Record<string, string> | undefined;
  if (!rawCounts || Object.keys(rawCounts).length === 0) return;

  const counts = Object.entries(rawCounts)
    .map(([questionId, rawCount]) => [questionId, parseInt(rawCount, 10)] as const)
    .filter(([, count]) => count > 0);
  if (counts.length === 0) return;

  try {
    await prisma.$transaction(
      counts.map(([questionId, count]) =>
        prisma.question.update({
          where: { id: questionId },
          data: { timesServed: { increment: count } },
        }),
      ),
    );
  } catch (err) {
    const multi = redis.multi();
    for (const [questionId, count] of counts) {
      multi.hincrby(BUFFER_KEY, questionId, count);
    }
    await multi.exec();
    throw err;
  }
}

export function startQuestionServeCountFlush(): void {
  setInterval(() => {
    flushQuestionServeCounts().catch((err) =>
      console.error('[questionServeBuffer] flush failed:', err),
    );
  }, FLUSH_INTERVAL_MS);
}
