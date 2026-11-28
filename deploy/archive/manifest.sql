-- Execute inside the same exported snapshot used by pg_dump.
-- Hashes only are emitted; row contents and credentials never enter the manifest.
SET TIME ZONE 'UTC';
SET DateStyle TO ISO, YMD;
SELECT format(
  'SELECT json_build_object(''schema'',%L,''table'',%L,''rows'',count(*),''hash'',md5(COALESCE(string_agg(md5(row_to_json(t)::text),'''' ORDER BY md5(row_to_json(t)::text)),''''))) FROM %I.%I AS t;',
  table_schema, table_name, table_schema, table_name
)
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema <> 'information_schema'
  AND table_schema !~ '^pg_'
  AND table_schema !~ '^archive_test_'
ORDER BY table_schema, table_name
\gexec
