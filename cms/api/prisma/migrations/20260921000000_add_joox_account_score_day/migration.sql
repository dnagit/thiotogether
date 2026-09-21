-- AlterTable
ALTER TABLE "joox_accounts" ADD COLUMN     "score_day" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "score_done" BOOLEAN NOT NULL DEFAULT false;
