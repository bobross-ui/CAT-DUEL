-- Replace single-column leaderboard indexes with composite ones that include
-- deletedAt and gamesPlayed as leading columns, matching the WHERE clauses in
-- getUserGlobalRank, getTierCounts, and getTierLeaderboard.
DROP INDEX IF EXISTS "users_elo_rating_idx";
DROP INDEX IF EXISTS "users_rank_tier_elo_rating_idx";

-- Global rank / total-ranked count: WHERE deletedAt IS NULL AND gamesPlayed >= N ORDER BY eloRating DESC
CREATE INDEX IF NOT EXISTS "users_deleted_at_games_played_elo_rating_idx"
  ON "users" ("deleted_at", "games_played", "elo_rating" DESC);

-- Tier leaderboard / tier counts: WHERE deletedAt IS NULL AND rankTier = X AND gamesPlayed >= N ORDER BY eloRating DESC
CREATE INDEX IF NOT EXISTS "users_deleted_at_rank_tier_games_played_elo_rating_idx"
  ON "users" ("deleted_at", "rank_tier", "games_played", "elo_rating" DESC);
