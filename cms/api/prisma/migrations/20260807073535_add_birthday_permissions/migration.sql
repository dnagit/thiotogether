-- Birthday wish wall: permissions and the role grants for them.
--
-- These live in a migration rather than in the seed because the seed rebuilds every
-- role's permission set from ROLE_PERMISSION_PRESETS, which would discard any grant an
-- admin has customised on a live installation. This adds only what is new and touches
-- nothing else.
--
-- Idempotent throughout: safe to re-run, and safe on a database where the permissions
-- were already inserted by hand.

INSERT INTO "permissions" ("name", "created_at", "updated_at")
VALUES
  ('birthday.view',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('birthday.manage',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('birthday.moderate', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- SUPER_ADMIN and ADMIN run the whole feature.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
  AND p."name" IN ('birthday.view', 'birthday.manage', 'birthday.moderate')
ON CONFLICT DO NOTHING;

-- EDITOR can look at the wall but not change it or moderate it, matching how EDITOR is
-- given games.view without games.manage.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'EDITOR'
  AND p."name" = 'birthday.view'
ON CONFLICT DO NOTHING;
