-- AlterTable
ALTER TABLE "birthday_wishes" ADD COLUMN     "background_id" INTEGER;

-- CreateTable
CREATE TABLE "birthday_card_backgrounds" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "image_url" VARCHAR(500) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "birthday_card_backgrounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "birthday_card_backgrounds_event_id_sort_order_idx" ON "birthday_card_backgrounds"("event_id", "sort_order");

-- AddForeignKey
ALTER TABLE "birthday_card_backgrounds" ADD CONSTRAINT "birthday_card_backgrounds_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "birthday_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_wishes" ADD CONSTRAINT "birthday_wishes_background_id_fkey" FOREIGN KEY ("background_id") REFERENCES "birthday_card_backgrounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

