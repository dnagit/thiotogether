-- CreateTable
CREATE TABLE "joox_accounts" (
    "id" SERIAL NOT NULL,
    "voter_id" INTEGER NOT NULL,
    "account_name" VARCHAR(100) NOT NULL,
    "account_user" VARCHAR(100) NOT NULL,
    "note" VARCHAR(1000),
    "user_key" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "joox_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "joox_account_votes" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "vote_account_id" INTEGER NOT NULL,
    "vote_day" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "joox_account_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "joox_accounts_voter_id_idx" ON "joox_accounts"("voter_id");

-- CreateIndex
CREATE UNIQUE INDEX "joox_accounts_voter_id_user_key_key" ON "joox_accounts"("voter_id", "user_key");

-- CreateIndex
CREATE INDEX "joox_account_votes_vote_account_id_idx" ON "joox_account_votes"("vote_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "joox_account_votes_account_id_vote_day_vote_account_id_key" ON "joox_account_votes"("account_id", "vote_day", "vote_account_id");

-- AddForeignKey
ALTER TABLE "joox_accounts" ADD CONSTRAINT "joox_accounts_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "joox_voters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "joox_account_votes" ADD CONSTRAINT "joox_account_votes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "joox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "joox_account_votes" ADD CONSTRAINT "joox_account_votes_vote_account_id_fkey" FOREIGN KEY ("vote_account_id") REFERENCES "joox_vote_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
