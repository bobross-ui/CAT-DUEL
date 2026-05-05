-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "passage_id" TEXT;

-- CreateTable
CREATE TABLE "passages" (
    "id" TEXT NOT NULL,
    "external_id" TEXT,
    "text" TEXT NOT NULL,
    "source" "QuestionSource" NOT NULL DEFAULT 'MANUAL',
    "source_pdf" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "passages_source_pdf_external_id_key" ON "passages"("source_pdf", "external_id");

-- CreateIndex
CREATE INDEX "questions_passage_id_idx" ON "questions"("passage_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
