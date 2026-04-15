-- CreateEnum
CREATE TYPE "QuestionCategory" AS ENUM ('QUANT', 'DILR', 'VARC');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('MANUAL', 'AI');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "sub_topic" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_answer" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "source" "QuestionSource" NOT NULL DEFAULT 'MANUAL',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "times_served" INTEGER NOT NULL DEFAULT 0,
    "times_correct" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_answers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "selected_answer" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "time_taken_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_category_difficulty_idx" ON "questions"("category", "difficulty");

-- CreateIndex
CREATE INDEX "questions_is_verified_category_idx" ON "questions"("is_verified", "category");

-- CreateIndex
CREATE INDEX "practice_answers_user_id_question_id_idx" ON "practice_answers"("user_id", "question_id");

-- AddForeignKey
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
