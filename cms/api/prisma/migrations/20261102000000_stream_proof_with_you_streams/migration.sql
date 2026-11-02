-- A second song's streams on each proof: "With you to the end", next to UNBOUND's. Optional,
-- so the proofs already sent keep counting as they did.

-- AlterTable
ALTER TABLE "stream_proofs" ADD COLUMN "with_you_streams" INTEGER;
