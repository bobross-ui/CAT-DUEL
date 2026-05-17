import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const BATCH_SIZE = 1000;
const TTL_HOURS = 24;

async function main() {
  const cutoff = new Date(Date.now() - TTL_HOURS * 60 * 60 * 1000);

  const guests = await prisma.user.findMany({
    where: { isGuest: true, createdAt: { lt: cutoff } },
    select: { id: true },
    take: BATCH_SIZE,
  });

  let deletedUsers = 0;
  let deletedMatches = 0;
  let deletedMatchAnswers = 0;

  for (const guest of guests) {
    try {
      await prisma.$transaction(async (tx) => {
        const guestMatches = await tx.match.findMany({
          where: { OR: [{ player1Id: guest.id }, { player2Id: guest.id }] },
          select: { id: true },
        });

        if (guestMatches.length > 0) {
          const matchIds = guestMatches.map((m) => m.id);
          const answerResult = await tx.matchAnswer.deleteMany({
            where: { matchId: { in: matchIds } },
          });
          const matchResult = await tx.match.deleteMany({
            where: { id: { in: matchIds } },
          });
          deletedMatchAnswers += answerResult.count;
          deletedMatches += matchResult.count;
        }

        await tx.practiceAnswer.deleteMany({ where: { userId: guest.id } });
        await tx.user.delete({ where: { id: guest.id } });
        deletedUsers += 1;
      });
    } catch (err) {
      console.error(`Failed to clean up guest ${guest.id}:`, err);
    }
  }

  console.log(
    `Cleanup complete: deleted ${deletedUsers} guests, ${deletedMatches} matches, ${deletedMatchAnswers} match answers (cutoff: ${cutoff.toISOString()})`,
  );
}

main().finally(() => prisma.$disconnect());
