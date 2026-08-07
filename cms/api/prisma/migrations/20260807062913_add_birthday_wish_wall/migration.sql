-- CreateEnum
CREATE TYPE "BirthdayWishStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "birthday_events" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "celebrant_name" VARCHAR(150),
    "description" TEXT,
    "cover_image" VARCHAR(500),
    "theme_color" VARCHAR(20),
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "birthday_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "birthday_gifts" (
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

-- CreateTable
CREATE TABLE "birthday_wishes" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "message" TEXT NOT NULL,
    "balloon_shape" VARCHAR(20) NOT NULL DEFAULT 'round',
    "balloon_color" VARCHAR(20) NOT NULL DEFAULT '#0ea5e9',
    "photo_url" VARCHAR(500),
    "photo_zoom" DOUBLE PRECISION,
    "photo_x" DOUBLE PRECISION,
    "photo_y" DOUBLE PRECISION,
    "gift_id" INTEGER,
    "status" "BirthdayWishStatus" NOT NULL DEFAULT 'APPROVED',
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "birthday_wishes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "birthday_events_slug_key" ON "birthday_events"("slug");

-- CreateIndex
CREATE INDEX "birthday_gifts_event_id_sort_order_idx" ON "birthday_gifts"("event_id", "sort_order");

-- CreateIndex
CREATE INDEX "birthday_wishes_event_id_status_created_at_idx" ON "birthday_wishes"("event_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "birthday_gifts" ADD CONSTRAINT "birthday_gifts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "birthday_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_wishes" ADD CONSTRAINT "birthday_wishes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "birthday_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_wishes" ADD CONSTRAINT "birthday_wishes_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "birthday_gifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
