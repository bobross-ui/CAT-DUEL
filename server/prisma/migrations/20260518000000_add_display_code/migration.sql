-- DropIndex
DROP INDEX IF EXISTS "users_display_name_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "display_code" TEXT;

-- Backfill display codes for existing named users. Display names are unique before
-- this migration, so deterministic row-number codes cannot conflict per name.
WITH numbered_users AS (
  SELECT
    "id",
    LPAD((100000 + (ROW_NUMBER() OVER (ORDER BY "created_at", "id") % 900000))::TEXT, 6, '0') AS "display_code"
  FROM "users"
  WHERE "display_name" IS NOT NULL
)
UPDATE "users"
SET "display_code" = numbered_users."display_code"
FROM numbered_users
WHERE "users"."id" = numbered_users."id";

-- CreateIndex
CREATE UNIQUE INDEX "users_display_name_display_code_key" ON "users"("display_name", "display_code");
