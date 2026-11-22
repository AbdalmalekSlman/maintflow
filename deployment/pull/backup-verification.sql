begin read only;
set local search_path = pg_catalog;

-- Save this result from the source and the isolated restore. It contains counts,
-- migration versions and a schema fingerprint, with no individual records.
with definitions as (
  select 'column' as kind,
    jsonb_build_array(c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod),
      a.attnotnull, a.attidentity, a.attgenerated, pg_get_expr(d.adbin, d.adrelid)) as definition
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  select 'constraint', jsonb_build_array(conrelid::regclass::text, conname, pg_get_constraintdef(oid), convalidated)
  from pg_constraint where connamespace = 'public'::regnamespace and conrelid <> 0
  union all
  select 'trigger', jsonb_build_array(t.tgname, pg_get_triggerdef(t.oid), t.tgenabled)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  union all
  select 'function', jsonb_build_array(p.proname, pg_get_functiondef(p.oid), p.prosecdef,
    has_function_privilege('anon', p.oid, 'execute'),
    has_function_privilege('authenticated', p.oid, 'execute'))
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
  union all
  select 'policy', jsonb_build_array(tablename, policyname, permissive, roles, cmd, qual, with_check)
  from pg_policies where schemaname = 'public'
  union all
  select 'rls', jsonb_build_array(relname, relrowsecurity, relforcerowsecurity,
    has_table_privilege('anon', oid, 'select'),
    has_table_privilege('authenticated', oid, 'select'))
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
)
select jsonb_build_object(
  'postgres_major', current_setting('server_version_num')::integer / 10000,
  'schema_sha256', (select encode(sha256(convert_to(
    jsonb_agg(jsonb_build_array(kind, definition) order by kind, definition)::text, 'UTF8')), 'hex')
    from definitions),
  'application_tables', (select count(*) from definitions where kind = 'rls'),
  'rls_tables', (select count(*) from pg_class where relnamespace = 'public'::regnamespace
    and relkind = 'r' and relrowsecurity),
  'row_counts', jsonb_build_object(
    'auth_rate_limits', (select count(*) from public.auth_rate_limits),
    'equipment', (select count(*) from public.equipment),
    'inventory', (select count(*) from public.inventory),
    'password_reset_requests', (select count(*) from public.password_reset_requests),
    'pm_schedules', (select count(*) from public.pm_schedules),
    'users', (select count(*) from public.users),
    'work_order_parts', (select count(*) from public.work_order_parts),
    'work_order_reopening_history', (select count(*) from public.work_order_reopening_history),
    'work_orders', (select count(*) from public.work_orders),
    'auth_users', (select count(*) from auth.users),
    'auth_identities', (select count(*) from auth.identities),
    'auth_sessions', (select count(*) from auth.sessions),
    'storage_buckets', (select count(*) from storage.buckets),
    'storage_objects', (select count(*) from storage.objects)),
  'migration_versions', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'orphan_profiles', (select count(*) from public.users u
    left join auth.users a on u.id = a.id where a.id is null),
  'orphan_identities', (select count(*) from auth.identities i
    left join auth.users a on i.user_id = a.id where a.id is null)
);

rollback;
