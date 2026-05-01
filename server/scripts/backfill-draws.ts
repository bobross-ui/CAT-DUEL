import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, gamesPlayed: true, wins: true },
  });

  const drawRows = await prisma.match.groupBy({
    by: ['player1Id'],
    where: { winnerId: null },
    _count: { _all: true },
  });

  const drawsByUser = new Map<string, number>();
  for (const row of drawRows) {
    drawsByUser.set(row.player1Id, row._count._all);
  }

  const player2DrawRows = await prisma.match.groupBy({
    by: ['player2Id'],
    where: { winnerId: null },
    _count: { _all: true },
  });

  for (const row of player2DrawRows) {
    drawsByUser.set(row.player2Id, (drawsByUser.get(row.player2Id) ?? 0) + row._count._all);
  }

  for (const user of users) {
    const draws = drawsByUser.get(user.id) ?? 0;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        draws,
        winRate: user.gamesPlayed > 0 ? user.wins / user.gamesPlayed : 0,
      },
    });
  }

  console.log(`Backfilled draws for ${users.length} users`);
}

main().finally(() => prisma.$disconnect());
