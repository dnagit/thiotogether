-- CreateEnum
CREATE TYPE "TokenLedgerReason" AS ENUM ('GRANT', 'SPEND', 'REFUND', 'REVOKE', 'ADJUST');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('DRAFT', 'OPEN', 'FULL', 'REVEALED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "DonationStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "donation_projects" ADD COLUMN     "token_ttl_days" INTEGER,
ADD COLUMN     "token_value" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "account_identity_id" INTEGER;

-- CreateTable
CREATE TABLE "account_identities" (
    "id" SERIAL NOT NULL,
    "normalized_name" VARCHAR(190) NOT NULL,
    "display_name" VARCHAR(190) NOT NULL,
    "claim_secret_hash" VARCHAR(255),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "account_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_grants" (
    "id" SERIAL NOT NULL,
    "account_identity_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "donation_id" INTEGER NOT NULL,
    "tokens_granted" INTEGER NOT NULL,
    "tokens_remaining" INTEGER NOT NULL,
    "token_value_at_grant" DECIMAL(14,2) NOT NULL,
    "donation_amount" DECIMAL(14,2) NOT NULL,
    "remainder_amount" DECIMAL(14,2) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "token_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_ledger_entries" (
    "id" SERIAL NOT NULL,
    "account_identity_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "grant_id" INTEGER,
    "reservation_id" INTEGER,
    "delta" INTEGER NOT NULL,
    "reason" "TokenLedgerReason" NOT NULL,
    "description" VARCHAR(255),
    "actor_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "cover_image" VARCHAR(500),
    "tile_count" INTEGER NOT NULL,
    "tile_front_image" VARCHAR(500),
    "tokens_per_tile" INTEGER NOT NULL DEFAULT 1,
    "status" "GameStatus" NOT NULL DEFAULT 'DRAFT',
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "show_reserver_names" BOOLEAN NOT NULL DEFAULT true,
    "max_tiles_per_account" INTEGER,
    "theme_color" VARCHAR(20),
    "shuffled_at" TIMESTAMP(3),
    "commitment_hash" VARCHAR(64),
    "revealed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_donation_projects" (
    "game_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,

    CONSTRAINT "game_donation_projects_pkey" PRIMARY KEY ("game_id","project_id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "label" VARCHAR(500) NOT NULL,
    "image_url" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_tiles" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "board_number" INTEGER NOT NULL,
    "front_image" VARCHAR(500),
    "reward_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "board_tiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "tile_id" INTEGER NOT NULL,
    "account_identity_id" INTEGER NOT NULL,
    "account_name_snapshot" VARCHAR(190) NOT NULL,
    "tokens_spent" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reveal_events" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "revealed_by_id" INTEGER,
    "tile_count" INTEGER NOT NULL,
    "commitment_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reveal_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_identities_normalized_name_key" ON "account_identities"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "token_grants_donation_id_key" ON "token_grants"("donation_id");

-- CreateIndex
CREATE INDEX "token_grants_account_identity_id_project_id_expires_at_crea_idx" ON "token_grants"("account_identity_id", "project_id", "expires_at", "created_at");

-- CreateIndex
CREATE INDEX "token_ledger_entries_account_identity_id_created_at_idx" ON "token_ledger_entries"("account_identity_id", "created_at");

-- CreateIndex
CREATE INDEX "token_ledger_entries_grant_id_idx" ON "token_ledger_entries"("grant_id");

-- CreateIndex
CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");

-- CreateIndex
CREATE INDEX "rewards_game_id_sort_order_idx" ON "rewards"("game_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "board_tiles_reward_id_key" ON "board_tiles"("reward_id");

-- CreateIndex
CREATE UNIQUE INDEX "board_tiles_game_id_board_number_key" ON "board_tiles"("game_id", "board_number");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_tile_id_key" ON "reservations"("tile_id");

-- CreateIndex
CREATE INDEX "reservations_game_id_account_identity_id_idx" ON "reservations"("game_id", "account_identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_game_id_idempotency_key_key" ON "reservations"("game_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "reveal_events_game_id_idx" ON "reveal_events"("game_id");

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_account_identity_id_fkey" FOREIGN KEY ("account_identity_id") REFERENCES "account_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_grants" ADD CONSTRAINT "token_grants_account_identity_id_fkey" FOREIGN KEY ("account_identity_id") REFERENCES "account_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_grants" ADD CONSTRAINT "token_grants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "donation_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_grants" ADD CONSTRAINT "token_grants_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_account_identity_id_fkey" FOREIGN KEY ("account_identity_id") REFERENCES "account_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "donation_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "token_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_donation_projects" ADD CONSTRAINT "game_donation_projects_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_donation_projects" ADD CONSTRAINT "game_donation_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "donation_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_tiles" ADD CONSTRAINT "board_tiles_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_tiles" ADD CONSTRAINT "board_tiles_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tile_id_fkey" FOREIGN KEY ("tile_id") REFERENCES "board_tiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_account_identity_id_fkey" FOREIGN KEY ("account_identity_id") REFERENCES "account_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reveal_events" ADD CONSTRAINT "reveal_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reveal_events" ADD CONSTRAINT "reveal_events_revealed_by_id_fkey" FOREIGN KEY ("revealed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
