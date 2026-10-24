-- CreateEnum
CREATE TYPE "JooxVoteType" AS ENUM ('ARTIST', 'SONG');

-- AlterTable
--
-- Every account already on the list starts as an artist; the UPDATE below then moves the ones
-- whose name marks them "(s)" or "(song)" over to songs — the same rule as `jooxVoteTypeOf`
-- in @cms/shared. "(a)", "(artist)" and no marker at all stay artists. Names are left as
-- they were. Deleted rows are sorted too, so one put back comes back with the right type.
ALTER TABLE "joox_vote_accounts" ADD COLUMN     "type" "JooxVoteType" NOT NULL DEFAULT 'ARTIST';

UPDATE "joox_vote_accounts"
SET "type" = 'SONG'
WHERE "account_name" ~* '\(\s*(s|song)\s*\)';
