-- Rewrite the origin baked into stored asset URLs.
--
-- LocalStorageProvider builds `${APP_URL}/uploads/<key>` at upload time and persists the
-- absolute URL, so a database moved between environments keeps pointing at the old host.
-- Changing APP_URL only affects new uploads; existing rows need this.
--
-- The origin is not confined to obvious columns like media.url — it also appears inside
-- page/block JSON and settings values, so every text and json column in the schema is
-- swept rather than a hand-written list that will drift as the schema grows.
--
-- Usage (BACK UP FIRST — this rewrites data in place):
--   sudo -u postgres pg_dump --format=custom cms > ~/cms-before-url-rewrite.dump
--   sudo -u postgres psql -d cms \
--     -v old_url='http://localhost:4009' \
--     -v new_url='https://tt-api.dna.co.th' \
--     -f deploy/rewrite-asset-urls.sql
--
-- Re-running is harmless: once no row contains old_url, every UPDATE matches zero rows.

\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('rewrite.old_url', :'old_url', true),
       set_config('rewrite.new_url', :'new_url', true);

DO $$
DECLARE
  r         record;
  old_url   text := current_setting('rewrite.old_url');
  new_url   text := current_setting('rewrite.new_url');
  changed   bigint;
  total     bigint := 0;
BEGIN
  IF old_url = '' OR new_url = '' THEN
    RAISE EXCEPTION 'old_url and new_url must both be set';
  END IF;

  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.is_updatable = 'YES'
      AND c.data_type IN ('character varying', 'text', 'json', 'jsonb')
    ORDER BY c.table_name, c.column_name
  LOOP
    IF r.data_type IN ('json', 'jsonb') THEN
      -- Cast through text: replace() has no json overload, and the round trip is safe
      -- because the substitution never touches structural characters.
      EXECUTE format(
        'UPDATE public.%I SET %I = replace(%I::text, %L, %L)::%s WHERE %I::text LIKE %L',
        r.table_name, r.column_name, r.column_name, old_url, new_url, r.data_type,
        r.column_name, '%' || old_url || '%');
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
        r.table_name, r.column_name, r.column_name, old_url, new_url,
        r.column_name, '%' || old_url || '%');
    END IF;

    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed > 0 THEN
      RAISE NOTICE '% .%  →  % rows', r.table_name, r.column_name, changed;
      total := total + changed;
    END IF;
  END LOOP;

  RAISE NOTICE 'total rows rewritten: %', total;
END $$;

COMMIT;
