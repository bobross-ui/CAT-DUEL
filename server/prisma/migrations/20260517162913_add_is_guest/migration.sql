-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_guest" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_is_guest_created_at_idx" ON "users"("is_guest", "created_at");
