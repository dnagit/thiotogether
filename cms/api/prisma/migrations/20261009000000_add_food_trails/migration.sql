-- CreateTable
CREATE TABLE "food_trails" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "food_trails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_places" (
    "id" SERIAL NOT NULL,
    "trail_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "note" VARCHAR(1000),
    "image" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "food_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_menus" (
    "id" SERIAL NOT NULL,
    "place_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "image" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "food_menus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_trails_is_active_sort_order_idx" ON "food_trails"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "food_places_trail_id_idx" ON "food_places"("trail_id");

-- CreateIndex
CREATE INDEX "food_menus_place_id_idx" ON "food_menus"("place_id");

-- AddForeignKey
ALTER TABLE "food_places" ADD CONSTRAINT "food_places_trail_id_fkey" FOREIGN KEY ("trail_id") REFERENCES "food_trails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menus" ADD CONSTRAINT "food_menus_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "food_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Food trail permissions, added here rather than by the seed for the same reason as
-- 20260829042600_add_projects_permissions: the seed would reset customised role grants.
INSERT INTO "permissions" ("name", "created_at", "updated_at")
VALUES
  ('food-trails.view',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('food-trails.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
  AND p."name" IN ('food-trails.view', 'food-trails.manage')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'EDITOR'
  AND p."name" = 'food-trails.view'
ON CONFLICT DO NOTHING;
