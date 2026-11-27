-- Limite de débit : table fermée aux clients, fonction réservée au rôle de service, compte et purge.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select is((select relrowsecurity from pg_class where oid = 'public.debit'::regclass), true, 'RLS activée sur debit');
select is_empty($$select 1 from pg_policy where polrelid = 'public.debit'::regclass$$, 'aucune politique');
select is(has_table_privilege('anon', 'public.debit', 'select,insert,update,delete'), false, 'anon sans privilège');
select is(has_table_privilege('authenticated', 'public.debit', 'select,insert,update,delete'), false, 'authenticated sans privilège');
select is(has_function_privilege('authenticated', 'public.consommer_debit(text,text,integer,integer)', 'execute'), false,
  'authenticated n''exécute pas la fonction');
select is(has_function_privilege('anon', 'public.consommer_debit(text,text,integer,integer)', 'execute'), false,
  'anon non plus');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok('select 1 from public.debit', '42501', null, 'un inscrit ne lit pas debit');
select throws_ok($$insert into public.debit (empreinte, action) values (repeat('a', 64), 'x')$$, '42501', null, 'ni n''y écrit');
select throws_ok($$select public.consommer_debit(repeat('a', 64), 'x', 5, 60)$$, '42501', null, 'ni n''appelle la fonction');
reset role;

set local role service_role;
select is((select public.consommer_debit(repeat('a', 64), 'test', 2, 3600)), 0, 'premier appel accepté');
select is((select public.consommer_debit(repeat('a', 64), 'test', 2, 3600)), 0, 'deuxième accepté');
select cmp_ok((select public.consommer_debit(repeat('a', 64), 'test', 2, 3600)), '>', 0, 'troisième refusé, avec une attente en secondes');
select is((select public.consommer_debit(repeat('b', 64), 'test', 2, 3600)), 0, 'une autre empreinte passe');
select is((select public.consommer_debit(repeat('a', 64), 'autre', 2, 3600)), 0, 'une autre action passe');
select throws_ok($$select public.consommer_debit(repeat('a', 64), 'test', 2, 90000)$$, 'P0001', null, 'une fenêtre de plus de 24 heures est refusée');
reset role;

insert into public.debit (empreinte, action, le) values (repeat('c', 64), 'vieux', now() - interval '25 hours');
set local role service_role;
select is((select public.consommer_debit(repeat('c', 64), 'nouveau', 1, 60)), 0, 'appel d''une empreinte ayant une vieille ligne');
reset role;
select is((select count(*) from public.debit where action = 'vieux'), 0::bigint, 'ses lignes de plus de 24 heures sont purgées');

select * from finish();
rollback;
