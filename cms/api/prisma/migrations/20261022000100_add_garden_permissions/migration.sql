-- Sunflower garden permissions, added here rather than by the seed for the same reason as
-- 20260807073535_add_birthday_permissions: the seed would reset customised role grants.
-- Idempotent throughout.

INSERT INTO "permissions" ("name", "created_at", "updated_at")
VALUES
  ('garden.view',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('garden.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- SUPER_ADMIN and ADMIN run the whole feature.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
  AND p."name" IN ('garden.view', 'garden.manage')
ON CONFLICT DO NOTHING;

-- EDITOR can look but not change, as with birthday.view.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'EDITOR'
  AND p."name" = 'garden.view'
ON CONFLICT DO NOTHING;
