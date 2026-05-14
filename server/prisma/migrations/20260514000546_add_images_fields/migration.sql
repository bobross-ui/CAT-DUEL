-- AlterTable
ALTER TABLE "passages" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "explanation_images" TEXT[] DEFAULT ARRAY[]::TEXT[];
