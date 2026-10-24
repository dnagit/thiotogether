-- Duplicates are judged within a type now: an Artist and a Song may share a name or a link,
-- two Artists (or two Songs) still may not. Nothing already on the list can clash under the
-- narrower rule, since it held under the wider one.

-- DropIndex
DROP INDEX "joox_vote_accounts_name_key_key";

-- DropIndex
DROP INDEX "joox_vote_accounts_link_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "joox_vote_accounts_type_name_key_key" ON "joox_vote_accounts"("type", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "joox_vote_accounts_type_link_key_key" ON "joox_vote_accounts"("type", "link_key");
