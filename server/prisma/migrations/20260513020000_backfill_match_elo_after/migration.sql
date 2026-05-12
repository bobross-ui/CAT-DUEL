WITH match_deltas AS (
  SELECT
    "id" AS "match_id",
    "player1_id" AS "user_id",
    1 AS "player_side",
    "finished_at",
    "player1_elo_change" AS "elo_delta"
  FROM "matches"

  UNION ALL

  SELECT
    "id" AS "match_id",
    "player2_id" AS "user_id",
    2 AS "player_side",
    "finished_at",
    "player2_elo_change" AS "elo_delta"
  FROM "matches"
),
user_delta_totals AS (
  SELECT "user_id", SUM("elo_delta") AS "total_delta"
  FROM match_deltas
  GROUP BY "user_id"
),
computed_ratings AS (
  SELECT
    d."match_id",
    d."player_side",
    (
      u."elo_rating"
      - t."total_delta"
      + SUM(d."elo_delta") OVER (
        PARTITION BY d."user_id"
        ORDER BY d."finished_at" ASC, d."match_id" ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )
    )::INTEGER AS "elo_after"
  FROM match_deltas AS d
  JOIN "users" AS u ON u."id" = d."user_id"
  JOIN user_delta_totals AS t ON t."user_id" = d."user_id"
)
UPDATE "matches" AS m
SET "player1_elo_after" = c."elo_after"
FROM computed_ratings AS c
WHERE c."match_id" = m."id"
  AND c."player_side" = 1
  AND m."player1_elo_after" <= 0;

WITH match_deltas AS (
  SELECT
    "id" AS "match_id",
    "player1_id" AS "user_id",
    1 AS "player_side",
    "finished_at",
    "player1_elo_change" AS "elo_delta"
  FROM "matches"

  UNION ALL

  SELECT
    "id" AS "match_id",
    "player2_id" AS "user_id",
    2 AS "player_side",
    "finished_at",
    "player2_elo_change" AS "elo_delta"
  FROM "matches"
),
user_delta_totals AS (
  SELECT "user_id", SUM("elo_delta") AS "total_delta"
  FROM match_deltas
  GROUP BY "user_id"
),
computed_ratings AS (
  SELECT
    d."match_id",
    d."player_side",
    (
      u."elo_rating"
      - t."total_delta"
      + SUM(d."elo_delta") OVER (
        PARTITION BY d."user_id"
        ORDER BY d."finished_at" ASC, d."match_id" ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )
    )::INTEGER AS "elo_after"
  FROM match_deltas AS d
  JOIN "users" AS u ON u."id" = d."user_id"
  JOIN user_delta_totals AS t ON t."user_id" = d."user_id"
)
UPDATE "matches" AS m
SET "player2_elo_after" = c."elo_after"
FROM computed_ratings AS c
WHERE c."match_id" = m."id"
  AND c."player_side" = 2
  AND m."player2_elo_after" <= 0;

UPDATE "users" AS u
SET "peak_elo" = GREATEST(
  u."peak_elo",
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
