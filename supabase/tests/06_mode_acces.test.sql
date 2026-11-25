-- Mode d'accès (story 1.3) : creer_compte selon le mode, regler_mode_acces, changer_pseudo, compte_actif() et lecture de
-- reglage, par rôle : visiteur, admin (A), membre actif (B), compte en attente (C), compte suspendu (D), rôle de service.
-- D est un admin suspendu : est_admin() le refuse. Identité simulée par le rôle et request.jwt.claims.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into auth.users (id, email) values
  ('20000000-0000-4000-8000-00000000000a', 'a@example.org'),
  ('20000000-0000-4000-8000-00000000000b', 'b@example.org'),
  ('20000000-0000-4000-8000-00000000000c', 'c@example.org'),
  ('20000000-0000-4000-8000-00000000000d', 'd@example.org'),
  ('20000000-0000-4000-8000-00000000000e', 'e@example.org');
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('20000000-0000-4000-8000-00000000000a', 'github', '2001', '{"sub":"2001"}'),
  ('20000000-0000-4000-8000-00000000000b', 'github', '2002', '{"sub":"2002"}'),
  ('20000000-0000-4000-8000-00000000000c', 'github', '2003', '{"sub":"2003"}'),
  ('20000000-0000-4000-8000-00000000000d', 'github', '2004', '{"sub":"2004"}'),
  ('20000000-0000-4000-8000-00000000000e', 'github', '2005', '{"sub":"2005"}');

-- Privilèges ------------------------------------------------------------------------------------
select is(has_function_privilege('authenticated', 'public.regler_mode_acces(text)', 'execute')
  and has_function_privilege('authenticated', 'public.changer_pseudo(text)', 'execute'), true,
  'authenticated exécute regler_mode_acces et changer_pseudo');
select is_empty($$
  select r, f from unnest(array['anon', 'service_role']) r, unnest(array['public.regler_mode_acces(text)', 'public.changer_pseudo(text)']) f
  where has_function_privilege(r, f, 'execute')
$$, 'ni anon ni service_role n''exécutent regler_mode_acces ni changer_pseudo');
select is(has_table_privilege('authenticated', 'public.reglage', 'select'), true, 'authenticated : select sur reglage (filtré par RLS)');
select is(has_table_privilege('authenticated', 'public.reglage', 'insert,update,delete,truncate,references,trigger'), false,
  'authenticated : aucune écriture sur reglage');
select is_empty($$
  select r from unnest(array['anon', 'service_role']) r
  where has_table_privilege(r, 'public.reglage', 'select,insert,update,delete,truncate,references,trigger')
$$, 'aucun droit sur reglage pour anon ni pour le rôle de service');
select policies_are('public', 'reglage', array['reglage_lecture_admin'], 'reglage : une seule politique, lecture admin');

-- creer_compte selon le mode ---------------------------------------------------------------------
set local role service_role;
select lives_ok($$select public.creer_compte('20000000-0000-4000-8000-00000000000a', 'admin_a', '2026-11-25', true, true)$$,
  'ouvert : A crée son compte');
select lives_ok($$select public.creer_compte('20000000-0000-4000-8000-00000000000b', 'membre_b', '2026-11-25', true, true)$$,
  'ouvert : B crée son compte');
select lives_ok($$select public.creer_compte('20000000-0000-4000-8000-00000000000d', 'suspendu_d', '2026-11-25', true, true)$$,
  'ouvert : D crée son compte');
reset role;
select is((select etat from public.compte where id = '20000000-0000-4000-8000-00000000000b'), 'actif', 'ouvert : le compte naît actif');

update public.reglage set mode_acces = 'liste_attente';
set local role service_role;
select lives_ok($$select public.creer_compte('20000000-0000-4000-8000-00000000000c', 'attente_c', '2026-11-25', true, true)$$,
  'liste_attente : C crée son compte');
reset role;
select is((select etat from public.compte where id = '20000000-0000-4000-8000-00000000000c'), 'en_attente',
  'liste_attente : le compte naît en_attente');

update public.reglage set mode_acces = 'ferme';
set local role service_role;
select throws_ok($$select public.creer_compte('20000000-0000-4000-8000-00000000000e', 'ferme_e', '2026-11-25', true, true)$$, 'P0001',
  'Les inscriptions sont fermées pour le moment.', 'ferme : création refusée');
reset role;
select is_empty($$select 1 from public.compte where id = '20000000-0000-4000-8000-00000000000e'$$, 'ferme : aucun compte créé');

-- Admin posé à la main (AD-3) ; D, admin puis suspendu.
update public.compte set role = 'admin' where id in ('20000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000d');
update public.compte set etat = 'suspendu' where id = '20000000-0000-4000-8000-00000000000d';

-- compte_actif() par rôle ------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(public.compte_actif(), true, 'admin actif : compte_actif() vrai');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is(public.compte_actif(), true, 'membre actif : compte_actif() vrai');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is(public.compte_actif(), false, 'compte en attente : compte_actif() faux');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000d","role":"authenticated"}';
select is(public.compte_actif(), false, 'compte suspendu : compte_actif() faux');
reset role;

-- Lecture de reglage : admin seulement ----------------------------------------------------------
set local role anon;
select throws_ok('select mode_acces from public.reglage', '42501', null, 'le visiteur ne lit pas reglage');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select results_eq('select mode_acces from public.reglage', $$values ('ferme')$$, 'l''admin lit le mode courant');
select throws_ok($$update public.reglage set mode_acces = 'ouvert'$$, '42501', null, 'l''admin n''écrit pas reglage directement');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is_empty('select 1 from public.reglage', 'le membre ne lit pas reglage');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is_empty('select 1 from public.reglage', 'le compte en attente ne lit pas reglage');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000d","role":"authenticated"}';
select is_empty('select 1 from public.reglage', 'l''admin suspendu ne lit pas reglage');
reset role;
set local role service_role;
select throws_ok('select 1 from public.reglage', '42501', null, 'le rôle de service ne lit pas reglage');
reset role;

-- regler_mode_acces ------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.regler_mode_acces('ouvert')$$, '42501', null, 'le visiteur ne règle pas le mode');
reset role;
set local role service_role;
select throws_ok($$select public.regler_mode_acces('ouvert')$$, '42501', null, 'le rôle de service ne règle pas le mode');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.regler_mode_acces('ouvert')$$, 'P0001', 'Réservé à l''administration.', 'le membre ne règle pas le mode');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select throws_ok($$select public.regler_mode_acces('ouvert')$$, 'P0001', 'Réservé à l''administration.', 'le compte en attente non plus');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000d","role":"authenticated"}';
select throws_ok($$select public.regler_mode_acces('ouvert')$$, 'P0001', 'Réservé à l''administration.', 'ni l''admin suspendu');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok($$select public.regler_mode_acces('grand_ouvert')$$, 'P0001', 'Mode d''accès inconnu.', 'mode inconnu refusé');
select throws_ok($$select public.regler_mode_acces(null)$$, 'P0001', 'Mode d''accès inconnu.', 'mode nul refusé');
select lives_ok($$select public.regler_mode_acces('liste_attente')$$, 'l''admin règle le mode');
select results_eq('select mode_acces from public.reglage', $$values ('liste_attente')$$, 'le mode est enregistré');
reset role;

-- changer_pseudo ---------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.changer_pseudo('anonyme')$$, '42501', null, 'le visiteur ne change aucun pseudo');
reset role;
set local role service_role;
select throws_ok($$select public.changer_pseudo('service')$$, '42501', null, 'le rôle de service non plus');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select lives_ok($$select public.changer_pseudo('nouveau_c')$$, 'en attente : C change son pseudo');
select results_eq('select pseudo from public.compte', $$values ('nouveau_c')$$, 'le nouveau pseudo est enregistré');
select throws_ok($$select public.changer_pseudo('MEMBRE_B')$$, 'P0001', 'Ce pseudo est déjà pris.',
  'pseudo pris, sans tenir compte de la casse');
select throws_ok($$select public.changer_pseudo('a b')$$, 'P0001',
  'Le pseudo fait 3 à 39 caractères : lettres sans accent, chiffres, tiret ou souligné.', 'pseudo hors format refusé');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.changer_pseudo('autre_b')$$, 'P0001',
  'Ton pseudo ne se change plus : il est figé une fois ton compte actif.', 'actif : pseudo figé');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000d","role":"authenticated"}';
select throws_ok($$select public.changer_pseudo('autre_d')$$, 'P0001',
  'Ton pseudo ne se change plus : il est figé une fois ton compte actif.', 'suspendu : pseudo figé');
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok($$select public.changer_pseudo('sans_compte')$$, 'P0001',
  'Ton pseudo ne se change plus : il est figé une fois ton compte actif.', 'sans compte : rien à changer');
reset role;
select results_eq($$select pseudo from public.compte where id in ('20000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-00000000000d') order by pseudo$$,
  $$values ('membre_b'), ('suspendu_d')$$, 'les pseudos figés n''ont pas bougé');

select * from finish();
rollback;
