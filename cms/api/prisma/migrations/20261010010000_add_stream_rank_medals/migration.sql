-- AlterTable
ALTER TABLE "stream_sessions" ADD COLUMN "star_rank_medals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "rising_rank_medals" TEXT[] DEFAULT ARRAY[]::TEXT[];
