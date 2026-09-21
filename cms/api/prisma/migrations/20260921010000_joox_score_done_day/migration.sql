-- AlterTable
--
-- Renamed rather than dropped and re-added: the column now stamps the tick alone — the score
-- beside it no longer resets — and a rename keeps the day stamps already written under it.
ALTER TABLE "joox_accounts" RENAME COLUMN "score_day" TO "score_done_day";
