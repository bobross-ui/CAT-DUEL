CREATE INDEX CONCURRENTLY IF NOT EXISTS "matches_player1_id_finished_at_id_idx" ON "matches"("player1_id", "finished_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "matches_player2_id_finished_at_id_idx" ON "matches"("player2_id", "finished_at" DESC, "id" DESC);

DROP INDEX CONCURRENTLY IF EXISTS "matches_player1_id_finished_at_idx";
DROP INDEX CONCURRENTLY IF EXISTS "matches_player2_id_finished_at_idx";
