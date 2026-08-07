-- ============================================================================
-- Birthday wish wall — manual database update
-- ============================================================================
--
-- USE THIS ONLY IF YOU CANNOT RUN PRISMA ON THE SERVER.
-- The supported path is:
--
--     npm run prisma:deploy        (from cms/, runs `prisma migrate deploy`)
--
-- which applies exactly the same changes and records them itself.
--
-- This script exists for servers where the API image has no Prisma CLI, and it
-- does two things that a hand-written SQL file normally forgets:
--
--   1. It is idempotent end to end — every statement is IF NOT EXISTS or
--      ON CONFLICT DO NOTHING — so a half-finished run can simply be repeated.
--   2. It registers both migrations in `_prisma_migrations` with their real
--      checksums, so a later `prisma migrate deploy` sees them as already
--      applied instead of trying to re-run them (which would fail on the
--      existing tables) or refusing to start over a checksum mismatch.
--
-- Run it inside a transaction against the API's database:
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/birthday-manual.sql
--
-- Applying this does not restart anything: deploy the new API build too, or the
-- endpoints the website calls will still 404.
-- ============================================================================

BEGIN;

-- ── 1. Schema ───────────────────────────────────────────────────────────────
-- Mirrors migrations/20260807062913_add_birthday_wish_wall.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BirthdayWishStatus') THEN
    CREATE TYPE "BirthdayWishStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "birthday_events" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "celebrant_name" VARCHAR(150),
    "description" TEXT,
    "cover_image" VARCHAR(500),
    "theme_color" VARCHAR(20),
    -- Closes the form while leaving the wall readable.
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    -- Hides the event from the website entirely.
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    -- New wishes wait for an admin instead of floating immediately.
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "birthday_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "birthday_gifts" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "image_url" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "birthday_gifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "birthday_wishes" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "message" TEXT NOT NULL,
    "balloon_shape" VARCHAR(20) NOT NULL DEFAULT 'round',
    "balloon_color" VARCHAR(20) NOT NULL DEFAULT '#0ea5e9',
    "photo_url" VARCHAR(500),
    -- Framing of the photo inside the balloon: a zoom plus an x/y offset in the
    -- shape's 100x100 box. Kept beside the original upload, not baked into it.
    "photo_zoom" DOUBLE PRECISION,
    "photo_x" DOUBLE PRECISION,
    "photo_y" DOUBLE PRECISION,
    "gift_id" INTEGER,
    "status" "BirthdayWishStatus" NOT NULL DEFAULT 'APPROVED',
    -- Moderation only; never returned by the public API.
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "birthday_wishes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "birthday_events_slug_key"
  ON "birthday_events"("slug");
CREATE INDEX IF NOT EXISTS "birthday_gifts_event_id_sort_order_idx"
  ON "birthday_gifts"("event_id", "sort_order");
CREATE INDEX IF NOT EXISTS "birthday_wishes_event_id_status_created_at_idx"
  ON "birthday_wishes"("event_id", "status", "created_at");

-- Foreign keys. `ADD CONSTRAINT` has no IF NOT EXISTS, so each is guarded.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'birthday_gifts_event_id_fkey') THEN
    ALTER TABLE "birthday_gifts"
      ADD CONSTRAINT "birthday_gifts_event_id_fkey"
      FOREIGN KEY ("event_id") REFERENCES "birthday_events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'birthday_wishes_event_id_fkey') THEN
    ALTER TABLE "birthday_wishes"
      ADD CONSTRAINT "birthday_wishes_event_id_fkey"
      FOREIGN KEY ("event_id") REFERENCES "birthday_events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- SET NULL, not CASCADE: retiring a gift must not delete the wishes that chose it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'birthday_wishes_gift_id_fkey') THEN
    ALTER TABLE "birthday_wishes"
      ADD CONSTRAINT "birthday_wishes_gift_id_fkey"
      FOREIGN KEY ("gift_id") REFERENCES "birthday_gifts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ── 2. Permissions ──────────────────────────────────────────────────────────
-- Mirrors migrations/20260807073535_add_birthday_permissions. Without these the
-- admin menu stays hidden even though the API is live.

INSERT INTO "permissions" ("name", "created_at", "updated_at")
VALUES
  ('birthday.view',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('birthday.manage',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('birthday.moderate', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
  AND p."name" IN ('birthday.view', 'birthday.manage', 'birthday.moderate')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'EDITOR'
  AND p."name" = 'birthday.view'
ON CONFLICT DO NOTHING;

-- ── 3. Tell Prisma both migrations are done ─────────────────────────────────
-- The checksums are the SHA-256 of the two migration.sql files as committed. Do
-- not edit them: `prisma migrate deploy` compares them against the files on disk
-- and aborts if they disagree.
--
-- Guarded with NOT EXISTS on the migration name rather than ON CONFLICT: the
-- primary key is a fresh UUID, so nothing would ever conflict and a second run
-- would file each migration twice.

INSERT INTO "_prisma_migrations"
  ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
SELECT gen_random_uuid()::text, m."checksum", m."name", NOW(), NOW(), 1
FROM (VALUES
  ('20260807062913_add_birthday_wish_wall',
   '2d258babe89f7707d5862df61bf248807a5051f59cde074321df7cd346f55893'),
  ('20260807073535_add_birthday_permissions',
   'dd13374fb8ddc47cc4673c28a8ee17349207c23499b245dfaf60db350da9f171')
) AS m("name", "checksum")
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" e WHERE e."migration_name" = m."name"
);

COMMIT;

-- ── 4. Optional: a starter event ────────────────────────────────────────────
-- Not run above. The website resolves a bare /birthday to the slug "birthday",
-- so without an event under that slug the URL 404s until you create one in the
-- admin. Uncomment to create it here instead.
--
-- INSERT INTO "birthday_events"
--   ("title", "slug", "celebrant_name", "description", "theme_color", "updated_at")
-- VALUES
--   ('อวยพรวันเกิด', 'birthday', NULL,
--    'เขียนคำอวยพร เลือกลูกโป่งและของขวัญ แล้วปล่อยให้ลอยขึ้นไปด้วยกัน',
--    '#ea480c', CURRENT_TIMESTAMP)
-- ON CONFLICT ("slug") DO NOTHING;
--
-- INSERT INTO "birthday_gifts" ("event_id", "name", "sort_order", "updated_at")
-- SELECT e."id", g."name", g."sort_order", CURRENT_TIMESTAMP
-- FROM "birthday_events" e
-- CROSS JOIN (VALUES
--   ('เค้กวันเกิด', 0), ('ช่อดอกไม้', 1), ('ตุ๊กตาหมี', 2),
--   ('กล่องของขวัญ', 3), ('บอลลูนช่อ', 4)
-- ) AS g("name", "sort_order")
-- WHERE e."slug" = 'birthday'
--   AND NOT EXISTS (SELECT 1 FROM "birthday_gifts" WHERE "event_id" = e."id");
