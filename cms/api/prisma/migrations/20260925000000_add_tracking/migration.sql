-- CreateTable
CREATE TABLE "tracking_projects" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tracking_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_entries" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "x_account" VARCHAR(100) NOT NULL,
    "tracking_no" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tracking_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracking_projects_is_active_sort_order_idx" ON "tracking_projects"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "tracking_entries_project_id_idx" ON "tracking_entries"("project_id");

-- CreateIndex
CREATE INDEX "tracking_entries_x_account_idx" ON "tracking_entries"("x_account");

-- AddForeignKey
ALTER TABLE "tracking_entries" ADD CONSTRAINT "tracking_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "tracking_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tracking permissions, added here rather than by the seed for the same reason as
-- 20260829042600_add_projects_permissions: the seed would reset customised role grants.
INSERT INTO "permissions" ("name", "created_at", "updated_at")
VALUES
  ('tracking.view',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tracking.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
  AND p."name" IN ('tracking.view', 'tracking.manage')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'EDITOR'
  AND p."name" = 'tracking.view'
ON CONFLICT DO NOTHING;
