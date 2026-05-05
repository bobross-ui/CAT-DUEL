ALTER TABLE "questions" ALTER COLUMN "source" DROP DEFAULT;

CREATE TYPE "QuestionSource_new" AS ENUM ('MANUAL', 'EXTRACTED');

ALTER TABLE "questions"
  ALTER COLUMN "source" TYPE "QuestionSource_new"
  USING ("source"::text::"QuestionSource_new");

DROP TYPE "QuestionSource";

ALTER TYPE "QuestionSource_new" RENAME TO "QuestionSource";

ALTER TABLE "questions" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
