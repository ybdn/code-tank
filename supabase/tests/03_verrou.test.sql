-- Bail global du jury : table fermée aux clients, fonctions réservées au rôle de service, prise, expiration, rendu, atomicité.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(24);

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
select throws_ok('select 1 from public.verrou', '42501', null, 'un inscrit ne lit pas verrou');
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
select throws_ok($$select public.prendre_verrou('jury', 'c', 7200)$$, 'P0001', null, 'un bail de plus d''une heure est refusé');
reset role;

-- Bail expiré : repris par un autre, et l'ancien détenteur ne peut plus rien rendre.
update public.verrou set expire_le = now() - interval '1 second' where nom = 'jury';
set local role service_role;
select is((select public.prendre_verrou('jury', 'c', 60) and not public.rendre_verrou('jury', 'b')), true, 'bail expiré repris ; l''ancien détenteur ne rend rien');
reset role;

-- Atomicité : deux sessions réelles (dblink) tentent la reprise d'un bail expiré au même instant. Une troisième tient la ligne
-- verrouillée pour que les deux prises attendent ensemble, puis la libère : une seule doit réussir. Ces sessions valident hors
-- de la transaction du test ; le nom est donc propre au test et effacé à la fin.
-- Par l'adresse réseau du serveur (celle de cette session) : seul l'accès local est sans mot de passe, et dblink en exige un.
select set_config('test.connexion', format('host=%s port=%s dbname=postgres user=postgres password=postgres',
  host(inet_server_addr()), inet_server_port()), true);
select extensions.dblink_connect('tient', current_setting('test.connexion'));
select extensions.dblink_connect('a', current_setting('test.connexion'));
select extensions.dblink_connect('b', current_setting('test.connexion'));
select extensions.dblink_exec('tient', $$insert into public.verrou values ('test_atomique', 'ancien', now() - interval '1 second')
  on conflict (nom) do update set detenteur = 'ancien', expire_le = now() - interval '1 second'$$);
select extensions.dblink_exec('tient', 'begin');
select extensions.dblink_exec('tient', $$update public.verrou set detenteur = 'ancien' where nom = 'test_atomique'$$);
select extensions.dblink_send_query('a', $$select public.prendre_verrou('test_atomique', 'a', 60)$$);
select extensions.dblink_send_query('b', $$select public.prendre_verrou('test_atomique', 'b', 60)$$);
select pg_sleep(0.5);
select is(extensions.dblink_is_busy('a') + extensions.dblink_is_busy('b'), 2, 'les deux prises attendent la même ligne');
select extensions.dblink_exec('tient', 'commit');
create temporary table prise as
  select * from extensions.dblink_get_result('a') as r(pris boolean)
  union all select * from extensions.dblink_get_result('b') as r(pris boolean);
select count(*) from extensions.dblink_get_result('a') as r(pris boolean);
select count(*) from extensions.dblink_get_result('b') as r(pris boolean);
select is((select count(*) from prise where pris), 1::bigint, 'de deux prises simultanées, une seule réussit');
select extensions.dblink_exec('tient', $$delete from public.verrou where nom = 'test_atomique'$$);
select extensions.dblink_disconnect('tient'), extensions.dblink_disconnect('a'), extensions.dblink_disconnect('b');

select * from finish();
rollback;
