-- CreateTable
CREATE TABLE "djs" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "image" VARCHAR(500),
    "note" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "djs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dj_slots" (
    "id" SERIAL NOT NULL,
    "dj_id" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dj_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dj_slots_starts_at_idx" ON "dj_slots"("starts_at");

-- CreateIndex
CREATE INDEX "dj_slots_dj_id_idx" ON "dj_slots"("dj_id");

-- AddForeignKey
ALTER TABLE "dj_slots" ADD CONSTRAINT "dj_slots_dj_id_fkey" FOREIGN KEY ("dj_id") REFERENCES "djs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DJ schedule permissions, added here rather than by the seed for the same reason as
-- 20260829042600_add_projects_permissions: the seed would reset customised role grants.
INSERT INTO "permissions" ("name", "created_at", "updated_at")
VALUES
  ('dj-schedule.view',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dj-schedule.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
  AND p."name" IN ('dj-schedule.view', 'dj-schedule.manage')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'EDITOR'
  AND p."name" = 'dj-schedule.view'
ON CONFLICT DO NOTHING;
