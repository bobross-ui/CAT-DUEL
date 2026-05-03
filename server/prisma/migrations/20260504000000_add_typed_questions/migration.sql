-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'TITA');

-- AlterEnum
ALTER TYPE "QuestionSource" ADD VALUE 'EXTRACTED';

-- AlterTable
ALTER TABLE "questions"
  ADD COLUMN "question_type" "QuestionType" NOT NULL DEFAULT 'MCQ',
  ADD COLUMN "sub_type" TEXT,
  ADD COLUMN "correct_answer_text" TEXT,
  ADD COLUMN "source_pdf" TEXT,
  ADD COLUMN "external_question_number" INTEGER,
  ADD COLUMN "answer_mismatch" BOOLEAN,
  ALTER COLUMN "options" DROP NOT NULL,
  ALTER COLUMN "correct_answer" DROP NOT NULL;

-- AlterTable
ALTER TABLE "practice_answers"
  ADD COLUMN "typed_answer" TEXT,
  ALTER COLUMN "selected_answer" DROP NOT NULL;

-- AlterTable
ALTER TABLE "match_answers"
  ADD COLUMN "typed_answer" TEXT,
  ALTER COLUMN "selected_answer" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "questions_source_pdf_external_question_number_key"
  ON "questions"("source_pdf", "external_question_number");
