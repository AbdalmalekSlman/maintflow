SELECT
    c.relname AS table_name,
    has_table_privilege('anon', c.oid, 'TRUNCATE')
        AS anon_truncate,
    has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        AS authenticated_truncate,
    has_table_privilege('anon', c.oid, 'TRIGGER')
        AS anon_trigger,
    has_table_privilege('authenticated', c.oid, 'TRIGGER')
        AS authenticated_trigger
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
      'equipment',
      'pm_schedules',
      'work_orders'
  )
ORDER BY c.relname;