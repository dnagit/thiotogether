-- AlterTable
--
-- Added, never rebuilt: every account already on the list keeps its name, link and today's
-- count, and starts from a score of 0.
ALTER TABLE "joox_vote_accounts" ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0;
