-- CreateTable
CREATE TABLE "joox_vote_accounts" (
    "id" SERIAL NOT NULL,
    "account_name" VARCHAR(100) NOT NULL,
    "link" VARCHAR(500) NOT NULL,
    "name_key" VARCHAR(100),
    "link_key" VARCHAR(500),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "vote_day" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "joox_vote_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "joox_vote_accounts_name_key_key" ON "joox_vote_accounts"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "joox_vote_accounts_link_key_key" ON "joox_vote_accounts"("link_key");

