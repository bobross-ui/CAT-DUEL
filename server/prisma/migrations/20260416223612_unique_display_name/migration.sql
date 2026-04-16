/*
  Warnings:

  - A unique constraint covering the columns `[display_name]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "users_display_name_key" ON "users"("display_name");
