-- Each award gets its own number of winners. The one shared number becomes Streaming Star's;
-- renamed rather than dropped and re-added, so rounds already set up keep it.
ALTER TABLE "stream_sessions" RENAME COLUMN "award_top" TO "star_count";
ALTER TABLE "stream_sessions" ADD COLUMN "rising_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stream_sessions" ADD COLUMN "pick_count" INTEGER NOT NULL DEFAULT 3;
