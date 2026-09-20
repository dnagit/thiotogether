-- ============================================================================
-- Birthday wish wall — the photo thumbnail column, applied by hand
-- ============================================================================
--
-- USE THIS ONLY IF YOU CANNOT RUN PRISMA ON THE SERVER.
-- The supported path is:
--
--     npm run prisma:deploy        (from cms/, runs `prisma migrate deploy`)
--
-- Same shape as `birthday-manual.sql`, and for the same reason: idempotent end
-- to end, and it files the migration in `_prisma_migrations` with its real
-- checksum so a later `prisma migrate deploy` treats it as already applied.
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/birthday-photo-thumb-manual.sql
--
-- The column only holds the small copy of each wish photo that the balloon wall
-- draws. Adding it changes nothing on its own — a null there means the wall
-- falls back to the original upload, which is exactly what it did before. Two
-- more things have to happen for the wall to get lighter:
--
--   1. Deploy the new API build, so wishes sent from now on arrive with one.
--   2. Fill it in for the wishes already sent:
--
--          npm run birthday:thumbs -w api
--
--      Safe to re-run, and it skips whatever already has a thumbnail. It reads
--      each original back over its own public URL, so run it somewhere that can
--      reach APP_URL.
-- ============================================================================

BEGIN;

-- ── 1. The column ───────────────────────────────────────────────────────────
ALTER TABLE "birthday_wishes"
  ADD COLUMN IF NOT EXISTS "photo_thumb_url" VARCHAR(500);

-- ── 2. Register the migration ───────────────────────────────────────────────
-- The checksum is the SHA-256 of the migration.sql file as committed. Do not
-- edit either without recomputing it.
--
-- Guarded by NOT EXISTS on the migration name rather than by ON CONFLICT: the
-- primary key is a fresh UUID, so nothing would ever conflict and a second run
-- would file the migration twice.

INSERT INTO "_prisma_migrations"
  ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
SELECT gen_random_uuid()::text, m."checksum", m."name", NOW(), NOW(), 1
FROM (VALUES
  ('20260920000000_add_birthday_wish_photo_thumb',
   '23413ffd06b46492d20a2175e72a32a935e372260a0fa9a90015cfe48cf6726d')
) AS m("name", "checksum")
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" e WHERE e."migration_name" = m."name"
);

COMMIT;
