-- Critères du jury : lus par tous, jamais écrits par un client, les huit de SPECS § 5.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select is(has_table_privilege('anon', 'public.critere', 'select'), true, 'anon lit critere');
select is(has_table_privilege('authenticated', 'public.critere', 'select'), true, 'authenticated lit critere');
select is(has_table_privilege('anon', 'public.critere', 'insert,update,delete,truncate'), false, 'anon n''écrit pas');
select is(has_table_privilege('authenticated', 'public.critere', 'insert,update,delete,truncate'), false, 'authenticated n''écrit pas');

select results_eq(
  'select cle, jure, poids, calcule from public.critere order by cle',
  $$values ('erreurs_cas_limites', 'sudo', 10, false), ('lisibilite_nommage', 'refacto', 10, false),
    ('originalite_finition', 'pitch', 10, false), ('outillage_doc', 'lint', 10, true), ('reponse_brief', 'pitch', 15, false),
    ('securite', 'sudo', 15, false), ('structure_decoupage', 'refacto', 15, false), ('tests', 'lint', 15, false)$$,
  'les huit critères, leur juré, leur poids');
select is((select sum(poids) from public.critere), 100::bigint, '100 points au total');

set local role anon;
select is((select count(*) from public.critere), 8::bigint, 'un anonyme lit les huit critères');
select throws_ok($$insert into public.critere values ('x', 'X', 'sudo', 1, false)$$, '42501', null, 'ni n''en ajoute');
select throws_ok($$update public.critere set poids = 99$$, '42501', null, 'ni n''en change');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*) from public.critere), 8::bigint, 'un inscrit lit les huit critères');
select throws_ok($$insert into public.critere values ('x', 'X', 'sudo', 1, false)$$, '42501', null, 'ni n''en ajoute');
select throws_ok($$update public.critere set poids = 99$$, '42501', null, 'ni n''en change');
select throws_ok($$delete from public.critere$$, '42501', null, 'ni n''en supprime');
reset role;

select * from finish();
rollback;
