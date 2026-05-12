CREATE INDEX IF NOT EXISTS "matches_player1_id_finished_at_id_idx" ON "matches"("player1_id", "finished_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "matches_player2_id_finished_at_id_idx" ON "matches"("player2_id", "finished_at" DESC, "id" DESC);

DROP INDEX IF EXISTS "matches_player1_id_finished_at_idx";
DROP INDEX IF EXISTS "matches_player2_id_finished_at_idx";
