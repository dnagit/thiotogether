-- CreateTable
CREATE TABLE "joox_voters" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "joox_voters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "joox_voter_sessions" (
    "id" SERIAL NOT NULL,
    "voter_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "joox_voter_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "joox_voters_username_key" ON "joox_voters"("username");

-- CreateIndex
CREATE UNIQUE INDEX "joox_voter_sessions_token_hash_key" ON "joox_voter_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "joox_voter_sessions_voter_id_idx" ON "joox_voter_sessions"("voter_id");

-- AddForeignKey
ALTER TABLE "joox_voter_sessions" ADD CONSTRAINT "joox_voter_sessions_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "joox_voters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The two permissions the admin screen is guarded by, and the roles that should already have
-- them. Done here rather than left to the seeder: seeding rebuilds every role's permission
-- set from the presets, which would undo whatever was tuned in the Roles screen since. These
-- statements add and never remove, so running them changes nothing else.
INSERT INTO "permissions" ("name", "created_at", "updated_at")
VALUES ('joox-voters.view', NOW(), NOW()), ('joox-voters.manage', NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
  AND p."name" IN ('joox-voters.view', 'joox-voters.manage')
ON CONFLICT DO NOTHING;
