import { PrismaClient } from '../src/generated/prisma/client';
import { getRankTier } from '../src/services/elo';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, eloRating: true } });
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: { rankTier: getRankTier(u.eloRating) },
    });
  }
  console.log(`Backfilled ${users.length} users`);
}

main().finally(() => prisma.$disconnect());
