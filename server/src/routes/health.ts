import { Router } from 'express';
import { prisma } from '../models/prisma';
import { redis } from '../config/redis';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

router.get('/health/ready', async (_req, res) => {
  const checks = await Promise.allSettled([
    timeout(prisma.$queryRaw`SELECT 1`, 1000),
    timeout(redis.ping(), 1000),
  ]);

  const [db, cache] = checks.map((r) => r.status === 'fulfilled');
  const ready = db && cache;

  res.status(ready ? 200 : 503).json({
    success: ready,
    data: { db, cache },
  });
});

export default router;
