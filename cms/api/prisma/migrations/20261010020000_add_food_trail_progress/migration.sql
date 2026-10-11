-- CreateTable
CREATE TABLE "food_trail_progress" (
    "id" SERIAL NOT NULL,
    "trail_id" INTEGER NOT NULL,
    "account" VARCHAR(100) NOT NULL,
    "place_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "menu_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_trail_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_trail_progress_trail_id_account_key" ON "food_trail_progress"("trail_id", "account");

-- AddForeignKey
ALTER TABLE "food_trail_progress" ADD CONSTRAINT "food_trail_progress_trail_id_fkey" FOREIGN KEY ("trail_id") REFERENCES "food_trails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
