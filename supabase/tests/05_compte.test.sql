-- Compte et réglage : droits par rôle, creer_compte (rôle de service seul ; identité GitHub, charte, majorité, pseudo), gardes.
-- A et B ont une identité GitHub, C non. Identité simulée par le rôle et request.jwt.claims.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-00000000000a', 'a@example.org'),
  ('10000000-0000-4000-8000-00000000000b', 'b@example.org'),
  ('10000000-0000-4000-8000-00000000000c', 'c@example.org');
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('10000000-0000-4000-8000-00000000000a', 'github', '1001', '{"sub":"1001"}'),
  ('10000000-0000-4000-8000-00000000000b', 'github', '1002', '{"sub":"1002"}'),
  ('10000000-0000-4000-8000-00000000000c', 'email', 'c@example.org', '{"sub":"c"}');

-- Schéma et privilèges ------------------------------------------------------------------------
select is((select mode_acces from public.reglage), 'ouvert', 'reglage : une ligne, mode ouvert par défaut');
select throws_ok($$insert into public.reglage (id) values (true)$$, '23505', null, 'reglage n''a qu''une ligne');
select is(has_table_privilege('anon', 'public.compte', 'select,insert,update,delete,truncate,references,trigger'), false,
  'anon : aucun droit sur compte');
select is(has_table_privilege('authenticated', 'public.compte', 'insert,update,delete,truncate,references,trigger'), false,
  'authenticated : aucune écriture sur compte');
select is(has_table_privilege('service_role', 'public.compte', 'select,insert,update,delete,truncate,references,trigger'), false,
  'service_role : aucun droit direct sur compte');
select is_empty($$
  select r from unnest(array['anon', 'authenticated', 'service_role']) r
  where has_table_privilege(r, 'public.reglage', 'select,insert,update,delete,truncate,references,trigger')
$$, 'aucun droit sur reglage, ni client ni rôle de service');
select is(has_function_privilege('anon', 'public.creer_compte(uuid,text,text,boolean,boolean)', 'execute')
  or has_function_privilege('authenticated', 'public.creer_compte(uuid,text,text,boolean,boolean)', 'execute'), false,
  'ni anon ni authenticated n''exécutent creer_compte');
select is(has_function_privilege('service_role', 'public.creer_compte(uuid,text,text,boolean,boolean)', 'execute'), true,
  'service_role exécute creer_compte');
select is(has_function_privilege('anon', 'public.est_admin()', 'execute')
  or has_function_privilege('anon', 'public.compte_actif()', 'execute'), false, 'anon n''exécute pas les gardes');
select is(has_function_privilege('service_role', 'public.est_admin()', 'execute')
  or has_function_privilege('service_role', 'public.compte_actif()', 'execute'), false, 'service_role n''exécute pas les gardes');

-- Visiteur et inscrit : pas d'accès direct ------------------------------------------------------
set local role anon;
select throws_ok('select 1 from public.compte', '42501', null, 'le visiteur ne lit pas compte');
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000a', 'visiteur', '2026-11-25', true, true)$$,
  '42501', null, 'ni ne crée de compte');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000a', 'ada', '1999-01-01', true, true)$$,
  '42501', null, 'un inscrit n''appelle pas creer_compte directement (limite par IP, version de charte)');
select is(public.compte_actif(), false, 'sans compte : compte_actif() faux');
reset role;

-- Création par le rôle de service ---------------------------------------------------------------
set local role service_role;
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000a', 'ada', '2026-11-25', false, true)$$, 'P0001',
  'Accepte la charte pour créer ton compte.', 'charte non cochée refusée');
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000a', 'ada', '2026-11-25', true, false)$$, 'P0001',
  'Il faut avoir 18 ans ou plus.', 'majorité non déclarée refusée');
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000a', 'a d', '2026-11-25', true, true)$$, 'P0001',
  null, 'pseudo hors format refusé');
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000a', 'ada', '', true, true)$$, 'P0001',
  null, 'version de charte vide refusée');
select lives_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000a', 'Ada', '2026-11-25', true, true)$$,
  'A crée son compte');
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000a', 'Ada2', '2026-11-25', true, true)$$, 'P0001',
  'Tu as déjà un compte.', 'pas de second compte pour la même identité');
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000b', 'aDA', '2026-11-25', true, true)$$, 'P0001',
  'Ce pseudo est déjà pris.', 'pseudo pris, sans tenir compte de la casse');
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000c', 'carl', '2026-11-25', true, true)$$, 'P0001',
  'Seule la connexion GitHub permet de créer un compte.', 'sans identité GitHub, pas de compte');
select throws_ok('select 1 from public.compte', '42501', null, 'le rôle de service ne lit pas compte directement');
reset role;

-- A lit son compte ; personne d'autre ne le lit ni ne l'écrit -------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select results_eq($$select github_id, pseudo, version_charte, role, etat from public.compte$$,
  $$values ('1001', 'Ada', '2026-11-25', 'membre', 'actif')$$, 'github_id de l''identité, rôle membre, actif en mode ouvert');
select isnt((select charte_acceptee_le from public.compte), null, 'charte_acceptee_le posée');
select isnt((select majeur_declare_le from public.compte), null, 'majeur_declare_le posée');
select is(public.compte_actif(), true, 'compte_actif() vrai');
select is(public.est_admin(), false, 'un membre n''est pas admin');
select throws_ok($$update public.compte set role = 'admin'$$, '42501', null, 'A ne change pas son rôle');
select throws_ok($$update public.compte set pseudo = 'autre'$$, '42501', null, 'ni son pseudo');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is_empty('select 1 from public.compte', 'B ne lit pas le compte de A');
reset role;

-- Mode d'accès autre qu'ouvert : personne n'entre (les autres modes arrivent avec la story 1.3).
update public.reglage set mode_acces = 'ferme';
set local role service_role;
select throws_ok($$select public.creer_compte('10000000-0000-4000-8000-00000000000b', 'bob', '2026-11-25', true, true)$$, 'P0001',
  'Les inscriptions sont fermées pour le moment.', 'mode non ouvert : création refusée');
reset role;

-- Gardes : admin posé à la main, suspendu --------------------------------------------------------
update public.compte set role = 'admin' where id = '10000000-0000-4000-8000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(public.est_admin(), true, 'admin actif : est_admin() vrai');
reset role;
update public.compte set etat = 'suspendu' where id = '10000000-0000-4000-8000-00000000000a';
set local role authenticated;
select is(public.compte_actif(), false, 'suspendu : compte_actif() faux');
select is(public.est_admin(), false, 'suspendu : est_admin() faux');
reset role;

select * from finish();
rollback;
