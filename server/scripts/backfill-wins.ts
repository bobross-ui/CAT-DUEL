import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, gamesPlayed: true },
  });

  const winRows = await prisma.match.groupBy({
    by: ['winnerId'],
    where: { winnerId: { not: null } },
    _count: { _all: true },
  });

  const winsByUser = new Map<string, number>();
  for (const row of winRows) {
    if (row.winnerId) winsByUser.set(row.winnerId, row._count._all);
  }

  for (const user of users) {
    const wins = winsByUser.get(user.id) ?? 0;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        wins,
        winRate: user.gamesPlayed > 0 ? wins / user.gamesPlayed : 0,
      },
    });
  }

  console.log(`Backfilled wins and win rates for ${users.length} users`);
}

main().finally(() => prisma.$disconnect());
