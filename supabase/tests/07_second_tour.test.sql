-- Second tour : dépôt caché au candidat, retrait du dépôt, publication protégée, pseudo figé,
-- classement complet (notes, rang, départage).
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- 1. Dépôt et alertes ------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*) from public.depot), 0::bigint, 'A ne lit plus la table depot');
select is_empty($$select alerte_manipulation, alertes_integrite, traces_ia from public.depot$$, 'ni les colonnes d''alerte');
select columns_are('public', 'mon_depot',
  array['participation_id', 'sha256', 'taille_octets', 'nb_fichiers', 'fichiers_exclus', 'nb_tokens',
        'presentation', 'demande', 'type_code', 'licence_presente', 'outils_ia', 'contact_reutilisation', 'depose_le'],
  'mon_depot n''a aucune colonne d''alerte');
select throws_ok($$select alerte_manipulation from public.mon_depot$$, '42703', null, 'les alertes ne sont pas dans mon_depot');
select columns_are('public', 'rapport', array['id', 'campagne_id', 'depot_id', 'jure', 'resultat'], 'rapport n''expose aucune alerte du dépôt');
select throws_ok($$select alerte_manipulation from public.classement$$, '42703', null, 'ni le classement');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select alerte_manipulation from public.depot where participation_id = '30000000-0000-4000-8000-00000000004c'),
  true, 'l''organisateur lit les alertes');

-- 2. Retrait du dépôt ---------------------------------------------------------------------------
reset role;
insert into public.participation (id, campagne_id, compte_id)
values ('30000000-0000-4000-8000-0000000000f1', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a');
insert into public.depot (participation_id, sha256, taille_octets, nb_fichiers, nb_tokens, presentation, type_code, licence_presente, declaration_code_le)
values ('30000000-0000-4000-8000-0000000000f1', repeat('a', 64), 1, 1, 1, 'Présentation fictive.', 'open_source', true, now());
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*) from public.mon_depot where participation_id = '30000000-0000-4000-8000-0000000000f1'), 1::bigint, 'A voit son dépôt');
select lives_ok($$select public.retirer_depot('20000000-0000-4000-8000-000000000002')$$, 'A retire son dépôt');
select is((select count(*) from public.mon_depot where participation_id = '30000000-0000-4000-8000-0000000000f1'), 0::bigint, 'le dépôt a disparu');
select throws_ok($$select public.retirer_depot('20000000-0000-4000-8000-000000000002')$$, 'P0001', null, 'pas de second retrait');
select throws_ok($$select public.retirer_depot('20000000-0000-4000-8000-000000000003')$$, 'P0001', null, 'pas de retrait en délibération');
select is((select count(*) from public.mon_depot where participation_id = '30000000-0000-4000-8000-00000000003a'), 1::bigint,
  'et le dépôt en délibération est intact');
select is((select etat::text from public.participation where id = '30000000-0000-4000-8000-0000000000f1'), 'inscrit', 'A reste inscrit');
reset role;
select is((select regles_figees_le is not null from public.campagne where slug = 'seed-ouverte'), true,
  'les règles restent figées après le retrait du seul dépôt');
insert into public.depot (participation_id, sha256, taille_octets, nb_fichiers, nb_tokens, presentation, type_code, licence_presente, declaration_code_le)
values ('30000000-0000-4000-8000-0000000000f1', repeat('b', 64), 1, 1, 1, 'Présentation fictive.', 'open_source', true, now());
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000d","role":"authenticated"}';
select throws_ok($$select public.retirer_depot('20000000-0000-4000-8000-000000000002')$$, 'P0001', null, 'D, sans dépôt, ne retire rien');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok($$select public.se_desinscrire('20000000-0000-4000-8000-000000000002')$$, 'A se désinscrit');
reset role;
select is((select count(*) from public.depot where participation_id = '30000000-0000-4000-8000-0000000000f1'), 0::bigint,
  'la désinscription supprime le dépôt');
select is((select etat::text from public.participation where id = '30000000-0000-4000-8000-0000000000f1'), 'retire', 'et retire la participation');
select is((select count(*) from public.depot), (select count(*) from public.participation p join public.depot d on d.participation_id = p.id), 'aucun dépôt orphelin');
select has_function('public', 'retirer_depot', array['uuid'], 'retirer_depot existe');
select ok(has_function_privilege('authenticated', 'public.retirer_depot(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.retirer_depot(uuid)', 'execute'), 'retirer_depot : authenticated seulement');

-- 3. Publication protégée -------------------------------------------------------------------------
update public.campagne set statut = 'prete' where slug = 'seed-deliberation';
select throws_ok($$update public.campagne set statut = 'publiee' where slug = 'seed-deliberation'$$, 'P0001',
  'Publication impossible : le vote du Boss n''est pas verrouillé pour toutes les participations avec dépôt.',
  'même la clé de service ne publie pas avec des votes non verrouillés');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.verrouiller_vote('30000000-0000-4000-8000-00000000003a')$$, 'vote d''alice verrouillé');
select throws_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000003', 'publiee')$$, 'P0001', null,
  'un participant sans vote bloque la publication');
select lives_ok($$insert into public.vote_boss (participation_id, note) values ('30000000-0000-4000-8000-00000000003b', 3)$$, 'vote de bob');
select throws_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000003', 'publiee')$$, 'P0001', null,
  'un vote non verrouillé la bloque aussi');
select lives_ok($$select public.verrouiller_vote('30000000-0000-4000-8000-00000000003b')$$, 'vote de bob verrouillé');
select lives_ok($$select public.changer_statut_campagne('20000000-0000-4000-8000-000000000003', 'publiee')$$, 'tous verrouillés : publication');

-- 5. Pseudo figé -----------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok($$update public.compte set pseudo = 'alice_bis' where id = '10000000-0000-4000-8000-00000000000a'$$, 'P0001',
  'Le pseudo ne se modifie plus une fois le compte autorisé.', 'compte autorisé : pseudo figé');
select lives_ok($$update public.compte set motivation = 'Autre motivation.', email_contact = 'a2@example.invalid' where id = '10000000-0000-4000-8000-00000000000a'$$,
  'le reste du profil reste modifiable');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$update public.compte set pseudo = 'victor_bis' where id = '10000000-0000-4000-8000-0000000000a1'$$, 'compte vérifié : pseudo modifiable');
reset role;
set local request.jwt.claims = '';
select lives_ok($$update public.compte set pseudo = 'alice_serveur' where id = '10000000-0000-4000-8000-00000000000a'$$,
  'le serveur (sans identité) peut le changer');

-- 4. Classement complet -----------------------------------------------------------------------------
-- Vote d'eve (40) rendu non verrouillé : le déclencheur de publication l'interdit désormais, la vue
-- reste pourtant défensive.
alter table public.vote_boss disable trigger vote_boss_fige;
update public.vote_boss set verrouille_le = null where participation_id = '30000000-0000-4000-8000-000000000040';
alter table public.vote_boss enable trigger vote_boss_fige;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select string_agg(pseudo, ', ' order by rang) from public.classement where rang is not null
           and campagne_id = '20000000-0000-4000-8000-000000000004'),
  'seed_bob, alice_serveur, candidat supprimé', 'rang : B devant A, puis le compte supprimé');
select is((select count(*) from public.classement where rang is null and campagne_id = '20000000-0000-4000-8000-000000000004'), 3::bigint,
  'rang nul : disqualifié, sans score (audit manquant), sans score final (vote non verrouillé)');
select is((select disqualifie from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'seed_chloe'), true, 'le disqualifié est signalé');
select is((select disqualifie from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'seed_bob'), false, 'pas les autres');
select is((select notes ->> 'securite' from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'alice_serveur'), '8', 'note d''un critère Claude');
select is((select notes ->> 'outillage' from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'alice_serveur'), '8', 'note du critère calculé');
select is((select count(*) from public.classement c, jsonb_object_keys(c.notes) where c.campagne_id = '20000000-0000-4000-8000-000000000004' and c.pseudo = 'alice_serveur'), 8::bigint, 'huit critères, rien d''autre');
select is((select jsonb_typeof(notes -> 'brief') from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'seed_frank'), 'null', 'critère sans audit : note nulle');

reset role;
-- Égalité : le vote de B passe à 6 (le gel est levé le temps du test) : 66,67 des deux côtés.
alter table public.vote_boss disable trigger vote_boss_fige;
update public.vote_boss set note = 6 where participation_id = '30000000-0000-4000-8000-00000000004b';
alter table public.vote_boss enable trigger vote_boss_fige;
set local role anon;
select is((select count(*) from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and rang = 1), 2::bigint, 'égalité sans départage : deux premiers');
reset role;
insert into public.decision (campagne_id, participation_id, type, justification)
values ('20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-00000000004b', 'departage', 'Départage fictif.');
set local role anon;
select is((select rang from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'seed_bob'), 1::bigint, 'le départagé passe devant');
select is((select rang from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'alice_serveur'), 2::bigint, 'l''autre est deuxième');
select is((select justification_departage from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'seed_bob'), 'Départage fictif.', 'justification du départage affichée');
select is((select justification_departage is null from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'alice_serveur'), true, 'pas pour l''autre');

select * from finish();
rollback;
