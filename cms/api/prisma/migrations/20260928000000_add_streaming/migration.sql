-- CreateEnum
CREATE TYPE "StreamProofStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "stream_sessions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "award_top" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stream_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_proofs" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "x_account" VARCHAR(100) NOT NULL,
    "image_url" VARCHAR(500),
    "note" VARCHAR(300),
    "streams" INTEGER,
    "status" "StreamProofStatus" NOT NULL DEFAULT 'PENDING',
    "review_note" VARCHAR(300),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stream_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_prizes" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "image" VARCHAR(500),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stream_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_picks" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "dj_id" INTEGER,
    "x_account" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stream_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_draws" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "x_account" VARCHAR(100) NOT NULL,
    "prize_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stream_draws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stream_sessions_starts_at_idx" ON "stream_sessions"("starts_at");

-- CreateIndex
CREATE INDEX "stream_proofs_session_id_status_idx" ON "stream_proofs"("session_id", "status");

-- CreateIndex
CREATE INDEX "stream_proofs_x_account_idx" ON "stream_proofs"("x_account");

-- CreateIndex
CREATE INDEX "stream_prizes_session_id_idx" ON "stream_prizes"("session_id");

-- CreateIndex
CREATE INDEX "stream_picks_session_id_idx" ON "stream_picks"("session_id");

-- CreateIndex
CREATE INDEX "stream_picks_x_account_idx" ON "stream_picks"("x_account");

-- CreateIndex
CREATE INDEX "stream_draws_session_id_idx" ON "stream_draws"("session_id");

-- CreateIndex
CREATE INDEX "stream_draws_x_account_idx" ON "stream_draws"("x_account");

-- AddForeignKey
ALTER TABLE "stream_proofs" ADD CONSTRAINT "stream_proofs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stream_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_prizes" ADD CONSTRAINT "stream_prizes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stream_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_picks" ADD CONSTRAINT "stream_picks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stream_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_picks" ADD CONSTRAINT "stream_picks_dj_id_fkey" FOREIGN KEY ("dj_id") REFERENCES "djs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_draws" ADD CONSTRAINT "stream_draws_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stream_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_draws" ADD CONSTRAINT "stream_draws_prize_id_fkey" FOREIGN KEY ("prize_id") REFERENCES "stream_prizes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Streaming permissions, added here rather than by the seed for the same reason as
-- 20260829042600_add_projects_permissions: the seed would reset customised role grants.
INSERT INTO "permissions" ("name", "created_at", "updated_at")
VALUES
  ('streaming.view',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('streaming.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
  AND p."name" IN ('streaming.view', 'streaming.manage')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'EDITOR'
  AND p."name" = 'streaming.view'
ON CONFLICT DO NOTHING;
