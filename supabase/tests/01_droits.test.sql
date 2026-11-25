-- revoke all par défaut : aucune table écrite ni aucune fonction exécutée directement par anon ou authenticated (AD-1).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is_empty($$
  select c.relname, r from pg_class c join pg_namespace n on n.oid = c.relnamespace, unnest(array['anon', 'authenticated']) r
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
    and has_table_privilege(r, c.oid, 'insert,update,delete,truncate,references,trigger')
$$, 'aucune écriture de table pour anon ni authenticated');
select is_empty($$
  select p.proname, r from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(array['anon', 'authenticated']) r
  where n.nspname = 'public' and has_function_privilege(r, p.oid, 'execute')
$$, 'aucune fonction exécutable par anon ni authenticated');
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
$$, 'RLS activée sur toutes les tables');

-- Une table créée plus tard n'hérite d'aucun droit client.
create table public.essai_defaut (id integer);
select is(has_table_privilege('anon', 'public.essai_defaut', 'select') or has_table_privilege('authenticated', 'public.essai_defaut', 'select'),
  false, 'une nouvelle table n''ouvre rien par défaut');
create sequence public.essai_sequence;
select is_empty($$
  select r, d from unnest(array['anon', 'authenticated']) r, unnest(array['usage', 'select', 'update']) d
  where has_sequence_privilege(r, 'public.essai_sequence', d)
$$, 'une nouvelle séquence n''ouvre ni usage, ni select, ni update à anon ni authenticated');
create function public.essai_fonction() returns integer language sql as 'select 1';
select is(has_function_privilege('anon', 'public.essai_fonction()', 'execute') or has_function_privilege('authenticated', 'public.essai_fonction()', 'execute'),
  false, 'une nouvelle fonction n''est exécutable ni par anon ni par authenticated');

select * from finish();
rollback;
