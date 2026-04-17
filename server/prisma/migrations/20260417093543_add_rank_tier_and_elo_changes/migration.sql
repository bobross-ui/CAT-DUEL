-- CreateEnum
CREATE TYPE "RankTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');

-- DropIndex
DROP INDEX "matches_player1_id_idx";

-- DropIndex
DROP INDEX "matches_player2_id_idx";

-- DropIndex
DROP INDEX "users_elo_rating_idx";

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "player1_elo_change" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "player2_elo_change" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'completed';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "rank_tier" "RankTier" NOT NULL DEFAULT 'SILVER';

-- CreateIndex
CREATE INDEX "matches_player1_id_finished_at_idx" ON "matches"("player1_id", "finished_at" DESC);

-- CreateIndex
CREATE INDEX "matches_player2_id_finished_at_idx" ON "matches"("player2_id", "finished_at" DESC);

-- CreateIndex
CREATE INDEX "users_elo_rating_idx" ON "users"("elo_rating" DESC);

-- CreateIndex
CREATE INDEX "users_rank_tier_elo_rating_idx" ON "users"("rank_tier", "elo_rating" DESC);
