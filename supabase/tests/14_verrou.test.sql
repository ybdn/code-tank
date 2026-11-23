-- Bail d'exclusion du jury : table fermée aux clients, fonctions réservées au rôle de service, prise, expiration, rendu.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select is((select relrowsecurity from pg_class where oid = 'public.verrou'::regclass), true, 'RLS activée sur verrou');
select is_empty($$select 1 from pg_policy where polrelid = 'public.verrou'::regclass$$, 'aucune politique');
select is(has_table_privilege('anon', 'public.verrou', 'select,insert,update,delete'), false, 'anon sans privilège');
select is(has_table_privilege('authenticated', 'public.verrou', 'select,insert,update,delete'), false, 'authenticated sans privilège');
select is(has_function_privilege('authenticated', 'public.prendre_verrou(text,text,integer)', 'execute'), false, 'authenticated ne prend pas');
select is(has_function_privilege('authenticated', 'public.rendre_verrou(text,text)', 'execute'), false, 'ni ne rend');
select is(has_function_privilege('anon', 'public.prendre_verrou(text,text,integer)', 'execute'), false, 'anon ne prend pas');
select is(has_function_privilege('anon', 'public.rendre_verrou(text,text)', 'execute'), false, 'ni ne rend');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok('select 1 from public.verrou', '42501', null, 'un candidat ne lit pas verrou');
select throws_ok($$select public.prendre_verrou('jury', 'x', 60)$$, '42501', null, 'ni ne prend le bail');
select throws_ok($$select public.rendre_verrou('jury', 'x')$$, '42501', null, 'ni ne le rend');
reset role;
set local role anon;
select throws_ok($$select public.prendre_verrou('jury', 'x', 60)$$, '42501', null, 'un anonyme ne prend pas le bail');
reset role;

set local role service_role;
select is((select public.prendre_verrou('jury', 'a', 60)), true, 'prise : nom libre');
select is((select public.prendre_verrou('jury', 'b', 60)), false, 'une seconde prise du même nom échoue');
select is((select public.prendre_verrou('jury', 'a', 60)), false, 'même pour le détenteur lui-même (pas réentrant)');
select is((select public.prendre_verrou('autre', 'b', 60)), true, 'un autre nom est libre');
select is((select public.rendre_verrou('jury', 'b')), false, 'rendu refusé à un autre détenteur');
select is((select count(*) from public.verrou where nom = 'jury' and detenteur = 'a'), 1::bigint, 'le bail est resté à son détenteur');
select is((select public.rendre_verrou('jury', 'a')), true, 'rendu par le détenteur');
select is((select public.prendre_verrou('jury', 'b', 60)), true, 'le nom rendu est libre');
reset role;

-- Bail expiré : repris par un autre, et l'ancien détenteur ne peut plus rien rendre.
update public.verrou set expire_le = now() - interval '1 second' where nom = 'jury';
set local role service_role;
select is((select public.prendre_verrou('jury', 'c', 60) and not public.rendre_verrou('jury', 'b')), true, 'bail expiré repris ; l''ancien détenteur ne rend rien');
reset role;

select * from finish();
rollback;
