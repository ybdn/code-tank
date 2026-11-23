-- Campagnes : création, statut, règles figées, fonctions réservées à l'organisateur.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

set local role authenticated;

-- Un candidat n'a aucune fonction d'organisateur ----------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok($$select public.decider_compte('10000000-0000-4000-8000-0000000000a1', 'autorise')$$,
  '42501', 'Réservé à l''organisateur.', 'décider_compte réservé');
select throws_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'inscriptions')$$,
  '42501', 'Réservé à l''organisateur.', 'changer_statut_campagne réservé');
select throws_ok($$select public.masquer_replique(gen_random_uuid())$$,
  '42501', 'Réservé à l''organisateur.', 'masquer_replique réservé');
select throws_ok($$select public.verrouiller_vote('30000000-0000-4000-8000-00000000003a')$$,
  '42501', 'Réservé à l''organisateur.', 'verrouiller_vote réservé');
select throws_ok($$select public.enregistrer_decision('30000000-0000-4000-8000-00000000004a', 'departage', 'x')$$,
  '42501', 'Réservé à l''organisateur.', 'enregistrer_decision réservé');
select throws_ok($$select public.ajouter_participant('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000b')$$,
  '42501', 'Réservé à l''organisateur.', 'ajouter_participant réservé');
select is_empty($$update public.campagne set titre = 'piraté' returning 1$$, 'un candidat ne modifie aucune campagne');
select throws_ok($$insert into public.campagne (slug) values ('x')$$, '42501', null, 'ni n''en crée');

-- Création et colonnes protégées ----------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into public.campagne (slug, titre, theme, brief, criteres, ouverture_inscriptions, cloture_depot, date_resultats, max_participants)
    values ('test-nouvelle', 'Nouvelle', 'Thème', 'Brief', '[]', now(), now() + '1 day', now() + '2 days', 4)$$,
  'l''organisateur crée une campagne');
select is((select statut::text from public.campagne where slug = 'test-nouvelle'), 'brouillon', 'elle naît en brouillon');
select throws_ok(
  $$insert into public.campagne (slug, titre, theme, brief, criteres, ouverture_inscriptions, cloture_depot, date_resultats, max_participants, statut)
    values ('test-triche', 'x', 'x', 'x', '[]', now(), now() + '1 day', now() + '2 days', 1, 'publiee')$$,
  '42501', null, 'on ne crée pas une campagne déjà publiée');
select throws_ok($$update public.campagne set statut = 'publiee' where slug = 'seed-brouillon'$$,
  '42501', null, 'le statut ne s''écrit pas directement');
select throws_ok($$update public.campagne set regles_figees_le = null where slug = 'seed-publiee'$$,
  '42501', null, 'regles_figees_le non plus');

-- Règles figées ----------------------------------------------------------------------------------
select throws_ok($$update public.campagne set brief = 'Autre brief' where slug = 'seed-deliberation'$$,
  'P0001', 'Les règles de la campagne sont figées depuis le premier dépôt.', 'le brief est figé');
select throws_ok($$update public.campagne set theme = 'Autre thème' where slug = 'seed-deliberation'$$,
  'P0001', null, 'le thème est figé');
select throws_ok($$update public.campagne set criteres = '[]' where slug = 'seed-deliberation'$$,
  'P0001', null, 'les critères et les poids sont figés');
select lives_ok($$update public.campagne set titre = 'Autre titre' where slug = 'seed-deliberation'$$,
  'le titre ne l''est pas');

select lives_ok($$update public.campagne set brief = 'Brief modifié' where slug = 'seed-ouverte'$$,
  'avant le premier dépôt, le brief se modifie');
reset role;
insert into public.participation (id, campagne_id, compte_id)
values ('30000000-0000-4000-8000-0000000000f1', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a');
select is((select regles_figees_le is null from public.campagne where slug = 'seed-ouverte'), true, 'sans dépôt, rien n''est figé');
insert into public.depot (participation_id, sha256, taille_octets, nb_fichiers, nb_tokens, presentation, type_code, licence_presente, declaration_code_le)
values ('30000000-0000-4000-8000-0000000000f1', repeat('a', 64), 1, 1, 1, 'Présentation fictive.', 'open_source', true, now());
select is((select regles_figees_le is not null from public.campagne where slug = 'seed-ouverte'), true, 'le premier dépôt fige les règles');
set local role authenticated;
select throws_ok($$update public.campagne set brief = 'Trop tard' where slug = 'seed-ouverte'$$,
  'P0001', null, 'le brief ne change plus');

-- Statut : seulement dans l'ordre -----------------------------------------------------------------
select throws_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'depot')$$,
  'P0001', 'Transition de statut interdite : de brouillon à depot.', 'on ne saute pas d''étape');
select lives_ok($$update public.campagne set criteres = '[{"cle":"a","libelle":"A","poids":90,"jure":"sudo"}]' where slug = 'seed-brouillon'$$,
  'critères de poids 90 en brouillon');
select throws_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'inscriptions')$$,
  'P0001', 'Les poids des critères doivent totaliser 100 avant l''ouverture des inscriptions.', 'les poids doivent totaliser 100');
select lives_ok($$update public.campagne set criteres = '[{"cle":"a","libelle":"A","poids":100,"jure":"sudo"}]' where slug = 'seed-brouillon'$$,
  'poids corrigés');
select lives_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'inscriptions')$$, 'brouillon vers inscriptions');
select throws_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'brouillon')$$,
  'P0001', null, 'pas de retour en arrière');
select lives_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'depot');
                  select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'deliberation');
                  select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'prete');
                  select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'publiee');
                  select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'archivee')$$,
  'toutes les étapes suivantes, dans l''ordre');
select is((select statut::text from public.campagne where slug = 'seed-brouillon'), 'archivee', 'campagne archivée');
select throws_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000001', 'publiee')$$,
  'P0001', null, 'une campagne archivée ne revient pas en arrière');
select throws_ok($$select public.changer_statut_campagne(gen_random_uuid(), 'inscriptions')$$,
  'P0001', 'Campagne introuvable.', 'campagne inconnue');

select * from finish();
rollback;
