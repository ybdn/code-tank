-- Campagnes du Boss (story 2.1) : creer_campagne, modifier_campagne, supprimer_brouillon, lecture, contraintes, index,
-- déclencheur de transitions et garde campagne_vivante, par rôle : visiteur, Boss (B), autre compte actif (O), compte en
-- attente (C), compte suspendu (S), rôle de service. Identité simulée par le rôle et request.jwt.claims.
begin;
create extension if not exists pgtap with schema extensions;
select plan(104);

insert into auth.users (id, email) values
  ('70000000-0000-4000-8000-00000000000b', 'b@example.org'),
  ('70000000-0000-4000-8000-00000000000e', 'o@example.org'),
  ('70000000-0000-4000-8000-00000000000c', 'c@example.org'),
  ('70000000-0000-4000-8000-00000000000d', 's@example.org');
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat) values
  ('70000000-0000-4000-8000-00000000000b', '7001', 'boss_b', now(), '2026-11-25', now(), 'actif'),
  ('70000000-0000-4000-8000-00000000000e', '7002', 'autre_o', now(), '2026-11-25', now(), 'actif'),
  ('70000000-0000-4000-8000-00000000000c', '7003', 'attente_c', now(), '2026-11-25', now(), 'en_attente'),
  ('70000000-0000-4000-8000-00000000000d', '7004', 'suspendu_s', now(), '2026-11-25', now(), 'suspendu');

-- Privilèges et schéma ---------------------------------------------------------------------------
select is(has_table_privilege('authenticated', 'public.campagne', 'select'), true, 'authenticated : select sur campagne (filtré par RLS)');
select is_empty($$
  select r from unnest(array['anon', 'service_role']) r
  where has_table_privilege(r, 'public.campagne', 'select,insert,update,delete,truncate,references,trigger')
$$, 'aucun droit sur campagne pour anon ni pour le rôle de service');
select is_empty($$
  select d from unnest(array['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) d
  where has_table_privilege('authenticated', 'public.campagne', d)
$$, 'authenticated : aucune écriture sur campagne');
select policies_are('public', 'campagne', array['campagne_lecture_boss'], 'campagne : une seule politique, lecture par le Boss');
select is_empty($$
  select r, f from unnest(array['authenticated']) r, unnest(array[
    'public.creer_campagne(text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz)',
    'public.modifier_campagne(uuid, text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz)',
    'public.supprimer_brouillon(uuid)']) f
  where not has_function_privilege(r, f, 'execute')
$$, 'authenticated exécute creer_campagne, modifier_campagne et supprimer_brouillon');
select is_empty($$
  select r, f from unnest(array['anon', 'service_role']) r, unnest(array[
    'public.creer_campagne(text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz)',
    'public.modifier_campagne(uuid, text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz)',
    'public.supprimer_brouillon(uuid)']) f
  where has_function_privilege(r, f, 'execute')
$$, 'ni anon ni le rôle de service n''exécutent les RPC du Boss');
select is_empty($$
  select r, f from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array[
    'public.est_boss(uuid)', 'public.campagne_vivante(uuid)', 'public.garder_transition()',
    'public.verifier_reglages(text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz)']) f
  where has_function_privilege(r, f, 'execute')
$$, 'gardes, contrôle et déclencheur : exécutables par aucun client');
select hasnt_column('public', 'campagne', 'criteres', 'aucune colonne criteres');
select hasnt_column('public', 'campagne', 'modeles', 'aucune colonne modeles');
select has_column('public', 'campagne', 'bloquee_le', 'colonne bloquee_le');
select has_column('public', 'campagne', 'motif_blocage', 'colonne motif_blocage');
select col_is_unique('public', 'campagne', 'slug', 'slug unique');

-- creer_campagne par rôle --------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  '42501', null, 'le visiteur ne crée pas de campagne');
reset role;
set local role service_role;
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  '42501', null, 'le rôle de service ne crée pas de campagne');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Seul un compte actif crée une campagne.', 'le compte en attente ne crée pas de campagne');
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000d","role":"authenticated"}';
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Seul un compte actif crée une campagne.', 'le compte suspendu non plus');

set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select matches(public.creer_campagne(E'\t Ma campagne d''été !\u00a0\n', ' Minuteur ', 'Un minuteur de pause.', array[' TypeScript ', 'Go'], 'publique', 'juge', 5,
  ((now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris', ((now() at time zone 'Europe/Paris') + interval '31 days') at time zone 'Europe/Paris', ((now() at time zone 'Europe/Paris') + interval '46 days') at time zone 'Europe/Paris'), '^ma-campagne-d-ete-[0-9a-f]{6}$',
  'B crée sa campagne aux bornes (30 j puis 15 j) : slug tiré du titre, suivi de 6 caractères hexadécimaux');
select results_eq($$select statut, titre, theme, langages, boss_id::text from public.campagne$$,
  $$values ('brouillon', 'Ma campagne d''été !', 'Minuteur', array['TypeScript', 'Go'], '70000000-0000-4000-8000-00000000000b')$$,
  'en brouillon, textes sans blancs de bord (tabulation, espace insécable, retour), B en est le Boss');
select throws_ok($$select public.creer_campagne('Deux', 'T', 'B', array['Go'], 'invitation', 'joueur', 1, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Tu as déjà une campagne en cours : une seule à la fois.', 'une seconde campagne active est refusée');
reset role;
select set_config('t.b', (select id::text from public.campagne where boss_id = '70000000-0000-4000-8000-00000000000b'), true);
select is(public.est_boss(current_setting('t.b')::uuid), true, 'est_boss vrai pour B');
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000e","role":"authenticated"}';
select is(public.est_boss(current_setting('t.b')::uuid), false, 'est_boss faux pour un autre compte');

-- Contrôles de creer_campagne (O, compte actif sans campagne) ----------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok($$select public.creer_campagne('  ', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Le titre fait 1 à 120 caractères.', 'titre vide refusé');
select throws_ok($$select public.creer_campagne(E'\t', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Le titre fait 1 à 120 caractères.', 'titre fait d''une tabulation refusé');
select throws_ok($$select public.creer_campagne('T', 'T', E'\n\n', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Le brief fait 1 à 2 000 caractères.', 'brief fait de retours à la ligne refusé');
select throws_ok($$select public.creer_campagne('T', E'\u00a0', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Le thème fait 1 à 200 caractères.', 'thème fait d''une espace insécable refusé');
select throws_ok($$select public.creer_campagne('T', 'T', repeat('x', 2001), array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Le brief fait 1 à 2 000 caractères.', 'brief de plus de 2 000 caractères refusé');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array[]::text[], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Indique de 1 à 20 langages, de 40 caractères au plus chacun.', 'aucun langage refusé');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go', ' '], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Indique de 1 à 20 langages, de 40 caractères au plus chacun.', 'langage vide refusé');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'privee', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'La visibilité est publique ou sur invitation.', 'visibilité inconnue refusée');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'arbitre', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Ton rôle est juge ou joueur.', 'rôle inconnu refusé');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 11, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Le nombre de places va de 1 à 10.', '11 places refusées');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 0, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Le nombre de places va de 1 à 10.', '0 place refusée');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 5, null, now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Les trois dates sont obligatoires, entre 2000 et 2100.', 'date manquante refusée');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '2 days', now() + interval '1 day', now() + interval '3 days')$$,
  'P0001', 'Les dates se suivent : ouverture des inscriptions, clôture du dépôt, puis résultats.', 'dates dans le désordre refusées');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 5, ((now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris', ((now() at time zone 'Europe/Paris') + interval '31 days 1 second') at time zone 'Europe/Paris', ((now() at time zone 'Europe/Paris') + interval '32 days') at time zone 'Europe/Paris')$$,
  'P0001', 'La clôture du dépôt tombe au plus 30 jours après l''ouverture des inscriptions.', 'dépôt de plus de 30 jours refusé');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 5, ((now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris', ((now() at time zone 'Europe/Paris') + interval '2 days') at time zone 'Europe/Paris', ((now() at time zone 'Europe/Paris') + interval '17 days 1 second') at time zone 'Europe/Paris')$$,
  'P0001', 'Les résultats tombent au plus 15 jours après la clôture du dépôt.', 'résultats plus de 15 jours après la clôture refusés');
select throws_ok($$select public.creer_campagne('T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() - interval '3 days', now() - interval '2 days', now() - interval '1 day')$$,
  'P0001', 'La date des résultats est déjà passée.', 'campagne déjà échue refusée');
select matches(public.creer_campagne('!!!', 'T', 'B', array['Go'], 'invitation', 'joueur', 1, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days'),
  '^[0-9a-f]{6}$', 'un titre sans lettre latine ni chiffre donne un slug fait du seul suffixe');
reset role;
delete from public.campagne where boss_id = '70000000-0000-4000-8000-00000000000e';

-- Bornes comptées à l'heure de Paris (celles des autres tests aussi : aucun test ne dépend du jour d'exécution), session
-- en UTC comme sous PostgREST ; changements d'heure de 2031, dates lointaines qui restent futures ---------------------
set local timezone = 'UTC';
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000e","role":"authenticated"}';
select lives_ok($$select public.creer_campagne('Hiver', 'T', 'B', array['Go'], 'publique', 'juge', 5, '2031-10-05 09:00 Europe/Paris', '2031-11-04 09:00 Europe/Paris', '2031-11-15 09:00 Europe/Paris')$$,
  '30 jours à l''heure de Paris, à travers le passage à l''heure d''hiver (30 j et 1 h en UTC) : accepté');
reset role;
delete from public.campagne where boss_id = '70000000-0000-4000-8000-00000000000e';
set local role authenticated;
select lives_ok($$select public.creer_campagne('Hiver', 'T', 'B', array['Go'], 'publique', 'juge', 5, '2031-10-15 09:00 Europe/Paris', '2031-10-20 09:00 Europe/Paris', '2031-11-04 09:00 Europe/Paris')$$,
  '15 jours à l''heure de Paris, à travers le passage à l''heure d''hiver : accepté');
reset role;
delete from public.campagne where boss_id = '70000000-0000-4000-8000-00000000000e';
set local role authenticated;
select throws_ok($$select public.creer_campagne('Été', 'T', 'B', array['Go'], 'publique', 'juge', 5, '2031-03-12 09:00 Europe/Paris', '2031-04-11 09:30 Europe/Paris', '2031-04-12 09:00 Europe/Paris')$$,
  'P0001', 'La clôture du dépôt tombe au plus 30 jours après l''ouverture des inscriptions.',
  '30 jours et 30 min à l''heure de Paris, à travers le passage à l''heure d''été (moins de 30 j en UTC) : refusé');
select throws_ok($$select public.creer_campagne('Été', 'T', 'B', array['Go'], 'publique', 'juge', 5, '2031-03-22 09:00 Europe/Paris', '2031-03-27 09:00 Europe/Paris', '2031-04-11 09:30 Europe/Paris')$$,
  'P0001', 'Les résultats tombent au plus 15 jours après la clôture du dépôt.',
  '15 jours et 30 min à l''heure de Paris, à travers le passage à l''heure d''été : refusé');
reset role;
select lives_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('heure-1', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, '2031-10-05 09:00 Europe/Paris', '2031-11-04 09:00 Europe/Paris', '2031-11-19 09:00 Europe/Paris')$$,
  'contraintes : 30 j puis 15 j à l''heure de Paris à travers l''heure d''hiver, acceptés en session UTC');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('heure-2', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, '2031-03-12 09:00 Europe/Paris', '2031-04-11 09:30 Europe/Paris', '2031-04-12 09:00 Europe/Paris')$$,
  '23514', 'new row for relation "campagne" violates check constraint "campagne_duree_depot"', 'contrainte : 30 j et 30 min à l''heure de Paris refusés en session UTC');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('heure-3', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, '2031-03-22 09:00 Europe/Paris', '2031-03-27 09:00 Europe/Paris', '2031-04-11 09:30 Europe/Paris')$$,
  '23514', 'new row for relation "campagne" violates check constraint "campagne_duree_resultats"', 'contrainte : 15 j et 30 min à l''heure de Paris refusés en session UTC');
delete from public.campagne where boss_id = '70000000-0000-4000-8000-00000000000e';
reset timezone;

-- Contraintes SQL (écriture directe par postgres) ---------------------------------------------------
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('x-1', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 11, now(), now() + interval '1 day', now() + interval '2 days')$$,
  '23514', null, 'contrainte : 10 places au plus');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('x-1', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), ((now() at time zone 'Europe/Paris') + interval '30 days 1 second') at time zone 'Europe/Paris', ((now() at time zone 'Europe/Paris') + interval '31 days') at time zone 'Europe/Paris')$$,
  '23514', 'new row for relation "campagne" violates check constraint "campagne_duree_depot"', 'contrainte : clôture ≤ ouverture + 30 j');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('x-1', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), ((now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris', ((now() at time zone 'Europe/Paris') + interval '16 days 1 second') at time zone 'Europe/Paris')$$,
  '23514', 'new row for relation "campagne" violates check constraint "campagne_duree_resultats"', 'contrainte : résultats ≤ clôture + 15 j');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('x-1', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), now() - interval '1 day', now() + interval '2 days')$$,
  '23514', 'new row for relation "campagne" violates check constraint "campagne_dates_ordre"', 'contrainte : dates dans l''ordre');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('x-1', '70000000-0000-4000-8000-00000000000b', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), now() + interval '1 day', now() + interval '2 days')$$,
  '23505', 'duplicate key value violates unique constraint "campagne_active_unique"', 'index unique partiel : une campagne active par Boss');

-- Lecture sous RLS ---------------------------------------------------------------------------------
set local role anon;
select throws_ok('select 1 from public.campagne', '42501', null, 'le visiteur ne lit pas campagne');
reset role;
set local role service_role;
select throws_ok('select 1 from public.campagne', '42501', null, 'le rôle de service ne lit pas campagne');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select results_eq('select id::text from public.campagne', $$values (current_setting('t.b'))$$, 'B lit sa campagne');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('direct', '70000000-0000-4000-8000-00000000000b', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), now() + interval '1 day', now() + interval '2 days')$$,
  '42501', null, 'le Boss n''insère pas directement');
select throws_ok($$update public.campagne set titre = 'Direct'$$, '42501', null, 'le Boss ne modifie pas directement');
select throws_ok($$delete from public.campagne$$, '42501', null, 'le Boss ne supprime pas directement');
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000e","role":"authenticated"}';
select is_empty('select 1 from public.campagne', 'un autre compte actif ne lit pas la campagne de B');
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is_empty('select 1 from public.campagne', 'le compte en attente non plus');
reset role;

-- modifier_campagne ----------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.modifier_campagne(current_setting('t.b')::uuid, 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  '42501', null, 'le visiteur ne modifie rien');
reset role;
set local role service_role;
select throws_ok($$select public.modifier_campagne(current_setting('t.b')::uuid, 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  '42501', null, 'le rôle de service ne modifie rien');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok($$select public.modifier_campagne(current_setting('t.b')::uuid, 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'CT404', 'Campagne introuvable.', 'un autre compte ne modifie pas la campagne de B (introuvable)');
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select throws_ok($$select public.modifier_campagne(current_setting('t.b')::uuid, 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'CT404', 'Campagne introuvable.', 'le compte en attente non plus');
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.modifier_campagne(gen_random_uuid(), 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'CT404', 'Campagne introuvable.', 'campagne absente : introuvable');
select throws_ok($$select public.modifier_campagne(current_setting('t.b')::uuid, 'T', 'T', 'B', array['Go'], 'publique', 'juge', 11, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Le nombre de places va de 1 à 10.', 'mêmes contrôles qu''à la création');
select lives_ok($$select public.modifier_campagne(current_setting('t.b')::uuid, 'Nouveau titre', 'Thème 2', 'Brief 2', array['Rust'], 'invitation', 'joueur', 10, now() + interval '2 days', now() + interval '3 days', now() + interval '4 days')$$,
  'B modifie son brouillon');
select results_eq($$select titre, theme, brief, langages, visibilite, role_boss, max_participants, slug ~ '^ma-campagne-d-ete-' from public.campagne$$,
  $$values ('Nouveau titre', 'Thème 2', 'Brief 2', array['Rust'], 'invitation', 'joueur', 10, true)$$, 'changements enregistrés, slug inchangé');
reset role;
update public.campagne set statut = 'ouverte' where id = current_setting('t.b')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select lives_ok($$select public.modifier_campagne(current_setting('t.b')::uuid, 'Titre ouvert', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'B modifie sa campagne ouverte tant que les règles ne sont pas figées');
select throws_ok($$select public.supprimer_brouillon(current_setting('t.b')::uuid)$$, 'P0001', 'Seul un brouillon se supprime.',
  'une campagne ouverte ne se supprime pas');
reset role;
update public.campagne set regles_figees_le = now() where id = current_setting('t.b')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.modifier_campagne(current_setting('t.b')::uuid, 'Figé', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Les règles sont figées : la campagne ne se modifie plus.', 'règles figées : modification refusée');
reset role;
select is((select titre from public.campagne where id = current_setting('t.b')::uuid), 'Titre ouvert', 'le titre n''a pas bougé');

-- Déclencheur de transitions (écrivain postgres : même le propriétaire est tenu) ----------------------
select throws_ok($$update public.campagne set statut = 'brouillon' where id = current_setting('t.b')::uuid$$, 'P0001',
  'Transition de statut interdite.', 'ouverte → brouillon refusée');
select throws_ok($$update public.campagne set statut = 'prete' where id = current_setting('t.b')::uuid$$, 'P0001',
  'Transition de statut interdite.', 'ouverte → prete refusée (saut d''étape)');
select lives_ok($$update public.campagne set statut = 'deliberation' where id = current_setting('t.b')::uuid$$, 'ouverte → deliberation');
select lives_ok($$update public.campagne set statut = 'prete' where id = current_setting('t.b')::uuid$$, 'deliberation → prete');
select lives_ok($$update public.campagne set statut = 'publiee' where id = current_setting('t.b')::uuid$$, 'prete → publiee');
select throws_ok($$update public.campagne set statut = 'expiree' where id = current_setting('t.b')::uuid$$, 'P0001',
  'Transition de statut interdite.', 'publiee → expiree refusée');
select lives_ok($$update public.campagne set statut = 'archivee' where id = current_setting('t.b')::uuid$$, 'publiee → archivee');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats, statut)
  values ('x-2', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), now() + interval '1 day', now() + interval '2 days', 'ouverte')$$,
  'P0001', 'Une campagne naît en brouillon.', 'une campagne naît en brouillon');
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('expire-1', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), now() + interval '1 day', now() + interval '2 days');
select throws_ok($$update public.campagne set statut = 'publiee' where slug = 'expire-1'$$, 'P0001', 'Transition de statut interdite.',
  'brouillon → publiee refusée');
select lives_ok($$update public.campagne set statut = 'expiree' where slug = 'expire-1'$$, 'brouillon → expiree');
select lives_ok($$update public.campagne set statut = statut, titre = 'Autre' where slug = 'expire-1'$$, 'sans changement de statut : la mise à jour passe');
-- expiree depuis ouverte, deliberation et prete.
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('expire-2', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), now() + interval '1 day', now() + interval '2 days');
update public.campagne set statut = 'ouverte' where slug = 'expire-2';
select lives_ok($$update public.campagne set statut = 'expiree' where slug = 'expire-2'$$, 'ouverte → expiree');
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('expire-3', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), now() + interval '1 day', now() + interval '2 days');
update public.campagne set statut = 'ouverte' where slug = 'expire-3';
update public.campagne set statut = 'deliberation' where slug = 'expire-3';
select lives_ok($$update public.campagne set statut = 'expiree' where slug = 'expire-3'$$, 'deliberation → expiree');
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('expire-4', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now(), now() + interval '1 day', now() + interval '2 days');
update public.campagne set statut = 'ouverte' where slug = 'expire-4';
update public.campagne set statut = 'deliberation' where slug = 'expire-4';
update public.campagne set statut = 'prete' where slug = 'expire-4';
select lives_ok($$update public.campagne set statut = 'expiree' where slug = 'expire-4'$$, 'prete → expiree');
select throws_ok($$update public.campagne set statut = 'ouverte' where slug = 'expire-1'$$, 'P0001', 'Transition de statut interdite.',
  'expiree est finale');

-- supprimer_brouillon et campagne_vivante ------------------------------------------------------------
-- B, dont la campagne est archivée, peut en créer une nouvelle.
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select lives_ok($$select public.creer_campagne('Deuxième', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'une campagne archivée n''est plus active : B en crée une autre');
reset role;
select set_config('t.b2', (select id::text from public.campagne where boss_id = '70000000-0000-4000-8000-00000000000b' and statut = 'brouillon'), true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok($$select public.supprimer_brouillon(current_setting('t.b2')::uuid)$$, 'CT404', 'Campagne introuvable.',
  'un autre compte ne supprime pas le brouillon de B');
reset role;
set local role service_role;
select throws_ok($$select public.supprimer_brouillon(current_setting('t.b2')::uuid)$$, '42501', null, 'le rôle de service ne supprime rien');
reset role;
set local role anon;
select throws_ok($$select public.supprimer_brouillon(current_setting('t.b2')::uuid)$$, '42501', null, 'le visiteur ne supprime rien');
reset role;
-- Bloquée : toute RPC du Boss refuse.
update public.campagne set bloquee_le = now(), motif_blocage = 'Essai' where id = current_setting('t.b2')::uuid;
select is(public.campagne_vivante(current_setting('t.b2')::uuid), false, 'bloquée : campagne_vivante faux');
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.modifier_campagne(current_setting('t.b2')::uuid, 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Cette campagne est bloquée ou échue : elle ne se modifie plus.', 'bloquée : modification refusée');
select throws_ok($$select public.supprimer_brouillon(current_setting('t.b2')::uuid)$$, 'P0001',
  'Cette campagne est bloquée ou échue : elle ne se supprime plus.', 'bloquée : suppression refusée');
reset role;
-- Échue : date_resultats passée.
update public.campagne set bloquee_le = null, motif_blocage = null, ouverture_inscriptions = now() - interval '3 days',
  cloture_depot = now() - interval '2 days', date_resultats = now() - interval '1 second' where id = current_setting('t.b2')::uuid;
select is(public.campagne_vivante(current_setting('t.b2')::uuid), false, 'échue : campagne_vivante faux');
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.modifier_campagne(current_setting('t.b2')::uuid, 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Cette campagne est bloquée ou échue : elle ne se modifie plus.', 'échue : modification refusée');
reset role;
update public.campagne set date_resultats = now() + interval '1 day' where id = current_setting('t.b2')::uuid;
select is(public.campagne_vivante(current_setting('t.b2')::uuid), true, 'ni bloquée ni échue : campagne_vivante vrai');
-- Brouillon échu : il ne se supprime pas, mais une nouvelle création le fait passer en expiree ; bloqué, il garde la place.
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('echu-1', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() - interval '3 days', now() - interval '2 days', now() - interval '1 day');
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok($$select public.supprimer_brouillon((select id from public.campagne where slug = 'echu-1'))$$, 'P0001',
  'Cette campagne est bloquée ou échue : elle ne se supprime plus.', 'brouillon échu : suppression refusée');
select lives_ok($$select public.creer_campagne('Après', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'brouillon échu : une nouvelle création passe');
reset role;
select results_eq($$select statut from public.campagne where slug = 'echu-1'$$, $$values ('expiree')$$, 'le brouillon échu est passé en expiree');
delete from public.campagne where boss_id = '70000000-0000-4000-8000-00000000000e' and statut = 'brouillon';
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats)
  values ('echu-2', '70000000-0000-4000-8000-00000000000e', 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() - interval '3 days', now() - interval '2 days', now() - interval '1 day');
update public.campagne set bloquee_le = now(), motif_blocage = 'Essai' where slug = 'echu-2';
set local role authenticated;
select throws_ok($$select public.creer_campagne('Après', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Tu as déjà une campagne en cours : une seule à la fois.', 'brouillon échu et bloqué : il garde la place');
reset role;
select results_eq($$select statut from public.campagne where slug = 'echu-2'$$, $$values ('brouillon')$$, 'le brouillon bloqué n''a pas bougé');
-- Boss suspendu : plus aucune RPC.
update public.compte set etat = 'suspendu' where id = '70000000-0000-4000-8000-00000000000b';
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.supprimer_brouillon(current_setting('t.b2')::uuid)$$, 'P0001', 'Ton compte n''est pas actif.',
  'Boss suspendu : suppression refusée');
select throws_ok($$select public.modifier_campagne(current_setting('t.b2')::uuid, 'T', 'T', 'B', array['Go'], 'publique', 'juge', 5, now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')$$,
  'P0001', 'Ton compte n''est pas actif.', 'Boss suspendu : modification refusée');
reset role;
update public.compte set etat = 'actif' where id = '70000000-0000-4000-8000-00000000000b';
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select lives_ok($$select public.supprimer_brouillon(current_setting('t.b2')::uuid)$$, 'B supprime son brouillon');
select is_empty($$select 1 from public.campagne where id = current_setting('t.b2')::uuid$$, 'le brouillon a disparu');
reset role;

select * from finish();
rollback;
