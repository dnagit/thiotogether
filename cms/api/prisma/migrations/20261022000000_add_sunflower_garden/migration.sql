-- CreateEnum
CREATE TYPE "GardenPlantStatus" AS ENUM ('VISIBLE', 'HIDDEN');

-- AlterTable
ALTER TABLE "token_ledger_entries" ADD COLUMN     "garden_purchase_id" INTEGER;

-- CreateTable
CREATE TABLE "garden_events" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "cover_image" VARCHAR(500),
    "field_image" VARCHAR(500),
    "theme_color" VARCHAR(20),
    "reveal_at" TIMESTAMPTZ(3) NOT NULL,
    "revealed_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "donation_project_id" INTEGER,
    "secret_token_price" INTEGER NOT NULL DEFAULT 1,
    "default_design_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_fertilizers" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),
    "image_url" VARCHAR(500),
    "color" VARCHAR(20) NOT NULL DEFAULT '#a16207',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_fertilizers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_flower_designs" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "image_url" VARCHAR(500) NOT NULL,
    "rarity" VARCHAR(20) NOT NULL DEFAULT 'common',
    "face_x" DOUBLE PRECISION,
    "face_y" DOUBLE PRECISION,
    "face_size" DOUBLE PRECISION,
    "on_shelf" BOOLEAN NOT NULL DEFAULT false,
    "shelf_order" INTEGER NOT NULL DEFAULT 0,
    "allow_face" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_flower_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_growth_stages" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "image_url" VARCHAR(500) NOT NULL,
    "starts_days_before_reveal" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_growth_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_recipes" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(100),
    "design_id" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_recipe_ingredients" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "fertilizer_id" INTEGER NOT NULL,
    "min_pct" INTEGER NOT NULL,
    "max_pct" INTEGER NOT NULL,

    CONSTRAINT "garden_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_faces" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(100),
    "image_url" VARCHAR(500) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_faces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_decorations" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "image_url" VARCHAR(500) NOT NULL,
    "unlock_amount" DECIMAL(14,2) NOT NULL,
    "pos_x" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "pos_y" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "size" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_decorations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_gardeners" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_gardeners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_plants" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "gardener_id" INTEGER NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "message" TEXT NOT NULL,
    "plot_index" INTEGER NOT NULL,
    "status" "GardenPlantStatus" NOT NULL DEFAULT 'VISIBLE',
    "recipe_id" INTEGER,
    "design_id" INTEGER,
    "secret_design_id" INTEGER,
    "face_id" INTEGER,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_plant_fertilizers" (
    "id" SERIAL NOT NULL,
    "plant_id" INTEGER NOT NULL,
    "fertilizer_id" INTEGER NOT NULL,
    "pct" INTEGER NOT NULL,

    CONSTRAINT "garden_plant_fertilizers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_purchases" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "plant_id" INTEGER NOT NULL,
    "design_id" INTEGER NOT NULL,
    "account_identity_id" INTEGER NOT NULL,
    "account_name_snapshot" VARCHAR(190) NOT NULL,
    "tokens_spent" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "garden_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "garden_events_slug_key" ON "garden_events"("slug");

-- CreateIndex
CREATE INDEX "garden_fertilizers_event_id_sort_order_idx" ON "garden_fertilizers"("event_id", "sort_order");

-- CreateIndex
CREATE INDEX "garden_flower_designs_event_id_sort_order_idx" ON "garden_flower_designs"("event_id", "sort_order");

-- CreateIndex
CREATE INDEX "garden_growth_stages_event_id_sort_order_idx" ON "garden_growth_stages"("event_id", "sort_order");

-- CreateIndex
CREATE INDEX "garden_recipes_event_id_idx" ON "garden_recipes"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "garden_recipe_ingredients_recipe_id_fertilizer_id_key" ON "garden_recipe_ingredients"("recipe_id", "fertilizer_id");

-- CreateIndex
CREATE INDEX "garden_faces_event_id_idx" ON "garden_faces"("event_id");

-- CreateIndex
CREATE INDEX "garden_decorations_event_id_idx" ON "garden_decorations"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "garden_gardeners_key_hash_key" ON "garden_gardeners"("key_hash");

-- CreateIndex
CREATE INDEX "garden_gardeners_event_id_idx" ON "garden_gardeners"("event_id");

-- CreateIndex
CREATE INDEX "garden_plants_event_id_status_plot_index_idx" ON "garden_plants"("event_id", "status", "plot_index");

-- CreateIndex
CREATE INDEX "garden_plants_gardener_id_idx" ON "garden_plants"("gardener_id");

-- CreateIndex
CREATE UNIQUE INDEX "garden_plants_event_id_plot_index_key" ON "garden_plants"("event_id", "plot_index");

-- CreateIndex
CREATE UNIQUE INDEX "garden_plant_fertilizers_plant_id_fertilizer_id_key" ON "garden_plant_fertilizers"("plant_id", "fertilizer_id");

-- CreateIndex
CREATE UNIQUE INDEX "garden_purchases_plant_id_key" ON "garden_purchases"("plant_id");

-- CreateIndex
CREATE INDEX "garden_purchases_account_identity_id_idx" ON "garden_purchases"("account_identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "garden_purchases_event_id_idempotency_key_key" ON "garden_purchases"("event_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_garden_purchase_id_fkey" FOREIGN KEY ("garden_purchase_id") REFERENCES "garden_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_events" ADD CONSTRAINT "garden_events_donation_project_id_fkey" FOREIGN KEY ("donation_project_id") REFERENCES "donation_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_events" ADD CONSTRAINT "garden_events_default_design_id_fkey" FOREIGN KEY ("default_design_id") REFERENCES "garden_flower_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_fertilizers" ADD CONSTRAINT "garden_fertilizers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "garden_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_flower_designs" ADD CONSTRAINT "garden_flower_designs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "garden_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_growth_stages" ADD CONSTRAINT "garden_growth_stages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "garden_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_recipes" ADD CONSTRAINT "garden_recipes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "garden_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_recipes" ADD CONSTRAINT "garden_recipes_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "garden_flower_designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_recipe_ingredients" ADD CONSTRAINT "garden_recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "garden_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_recipe_ingredients" ADD CONSTRAINT "garden_recipe_ingredients_fertilizer_id_fkey" FOREIGN KEY ("fertilizer_id") REFERENCES "garden_fertilizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_faces" ADD CONSTRAINT "garden_faces_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "garden_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_decorations" ADD CONSTRAINT "garden_decorations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "garden_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_gardeners" ADD CONSTRAINT "garden_gardeners_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "garden_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_plants" ADD CONSTRAINT "garden_plants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "garden_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_plants" ADD CONSTRAINT "garden_plants_gardener_id_fkey" FOREIGN KEY ("gardener_id") REFERENCES "garden_gardeners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_plants" ADD CONSTRAINT "garden_plants_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "garden_recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_plants" ADD CONSTRAINT "garden_plants_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "garden_flower_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_plants" ADD CONSTRAINT "garden_plants_secret_design_id_fkey" FOREIGN KEY ("secret_design_id") REFERENCES "garden_flower_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_plants" ADD CONSTRAINT "garden_plants_face_id_fkey" FOREIGN KEY ("face_id") REFERENCES "garden_faces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_plant_fertilizers" ADD CONSTRAINT "garden_plant_fertilizers_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "garden_plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_plant_fertilizers" ADD CONSTRAINT "garden_plant_fertilizers_fertilizer_id_fkey" FOREIGN KEY ("fertilizer_id") REFERENCES "garden_fertilizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_purchases" ADD CONSTRAINT "garden_purchases_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "garden_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_purchases" ADD CONSTRAINT "garden_purchases_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "garden_plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_purchases" ADD CONSTRAINT "garden_purchases_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "garden_flower_designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_purchases" ADD CONSTRAINT "garden_purchases_account_identity_id_fkey" FOREIGN KEY ("account_identity_id") REFERENCES "account_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

