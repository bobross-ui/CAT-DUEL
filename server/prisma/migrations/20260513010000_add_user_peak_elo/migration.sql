ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "peak_elo" INTEGER NOT NULL DEFAULT 1200;

UPDATE "users" AS u
SET "peak_elo" = GREATEST(
  u."elo_rating",
  1200,
  COALESCE((
    SELECT MAX(rating_snapshot."elo_after")
    FROM (
      SELECT m."player1_elo_after" AS "elo_after"
      FROM "matches" AS m
      WHERE m."player1_id" = u."id"
        AND m."player1_elo_after" > 0

      UNION ALL

      SELECT m."player2_elo_after" AS "elo_after"
      FROM "matches" AS m
      WHERE m."player2_id" = u."id"
        AND m."player2_elo_after" > 0
    ) AS rating_snapshot
  ), 1200)
);
