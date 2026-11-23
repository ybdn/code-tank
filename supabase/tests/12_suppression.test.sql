-- Départ d'un compte : participation_apres_depart anonymise la ligne du classement d'une campagne publiée, et supprime
-- tout le reste. Le compte de test (b1) a un dépôt dans une campagne publiée (04, avec un commentaire du Boss verrouillé)
-- et dans une campagne en délibération (03) ; il est aussi inscrit, sans dépôt, à seed-ouverte (02).
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, aud, role, email) values ('10000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'b1@example.invalid');
insert into public.compte (id, github_id, vrai_nom, pseudo, email_contact, email_verifie_le, motivation, depot_cite_url,
  majeur_declare_le, charte_acceptee_le, version_charte, etat)
values ('10000000-0000-4000-8000-0000000000b1', 'fictif-b1', 'Nom Réel', 'seed_zoe', 'b1@example.invalid', now(), 'Motivation.',
  'https://example.invalid/zoe', now(), now(), '2026-11-22', 'autorise');
insert into public.participation (id, campagne_id, compte_id) values
  ('30000000-0000-4000-8000-0000000000b4', '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-0000000000b1'),
  ('30000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-0000000000b1'),
  ('30000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-0000000000b1');
insert into public.depot (participation_id, chemin_stockage, sha256, taille_octets, nb_fichiers, fichiers_exclus, nb_tokens,
  presentation, demande, type_code, licence_presente, declaration_code_le, outils_ia, traces_ia, contact_reutilisation,
  alerte_manipulation, alertes_integrite, note_outillage, faits)
select p, '4/x/a.zip', repeat('a', 64), 1000, 10, '[{"chemin":"x"}]', 1000, 'Ma présentation.', 'Ma demande', 'open_source', true,
  now(), '["Claude Code"]', '["trace"]', true, true, '["alerte"]', 8, '{"a":1}'
from (values ('30000000-0000-4000-8000-0000000000b4'::uuid), ('30000000-0000-4000-8000-0000000000b3'::uuid)) v(p);
insert into public.reception (participation_id, chemin_stockage, presentation, type_code, declaration_code_le)
values ('30000000-0000-4000-8000-0000000000b4', '4/x/b.zip', 'Réception.', 'open_source', now());
insert into public.audit (depot_id, jure, modele, version_consignes, statut, resultat)
select d.id, j.jure, 'm', 'v', 'termine', jsonb_build_object(
  'criteres', (select jsonb_agg(jsonb_build_object('cle', k ->> 'cle', 'note', 8, 'justification', 'Texte sur le candidat.',
                'preuves', jsonb_build_array(jsonb_build_object('fichier', 'a.ts', 'ligne', 3))))
               from public.campagne c, jsonb_array_elements(c.criteres) k
               where c.id = '20000000-0000-4000-8000-000000000004' and k ->> 'jure' = j.jure
                 and not coalesce((k ->> 'calcule')::boolean, false)),
  'replique', 'Réplique.', 'verdict', 'convaincu')
from public.depot d cross join (values ('sudo'), ('refacto'), ('lint'), ('pitch')) j(jure)
where d.participation_id = '30000000-0000-4000-8000-0000000000b4';
insert into public.vote_boss (participation_id, note, commentaire, verrouille_le) values
  ('30000000-0000-4000-8000-0000000000b4', 6, 'Commentaire sur la personne.', now());
insert into public.decision (campagne_id, participation_id, type, justification) values
  ('20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-0000000000b4', 'fermeture_compte', 'Motif privé.'),
  ('20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-0000000000b4', 'departage', 'Départage public.');

select is((select pseudo from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004' and pseudo = 'seed_zoe'),
  'seed_zoe', 'avant : la ligne est au nom du pseudo');
select is((select count(*) from public.classement where pseudo = 'candidat supprimé'), 1::bigint, 'avant : une seule ligne anonyme (celle du seed)');

delete from public.compte where id = '10000000-0000-4000-8000-0000000000b1';

select is((select count(*) from public.compte where id = '10000000-0000-4000-8000-0000000000b1'), 0::bigint, 'le compte n''existe plus');
select is((select count(*) from public.participation where compte_id is null and id in (
  '30000000-0000-4000-8000-0000000000b4', '30000000-0000-4000-8000-0000000000b3', '30000000-0000-4000-8000-0000000000b2')),
  1::bigint, 'une seule participation reste : celle de la campagne publiée');
select is((select count(*) from public.participation where id in ('30000000-0000-4000-8000-0000000000b3', '30000000-0000-4000-8000-0000000000b2')),
  0::bigint, 'celles de la campagne en délibération et de la campagne ouverte sont supprimées');
select is((select count(*) from public.depot where participation_id = '30000000-0000-4000-8000-0000000000b3'), 0::bigint, 'avec leur dépôt');
select is((select count(*) from public.classement where pseudo = 'candidat supprimé'), 2::bigint, 'le classement a une ligne anonyme de plus');
select is((select count(*) from public.classement where pseudo = 'seed_zoe'), 0::bigint, 'plus aucune ligne au pseudo');
select is((select score_claude from public.classement where pseudo = 'candidat supprimé' and note_boss = 6), 80::numeric, 'le score Claude reste');
select is((select note_boss from public.classement where pseudo = 'candidat supprimé' and score_claude = 80), 6, 'la note du Boss reste');
select is((select justification_departage from public.classement where pseudo = 'candidat supprimé' and note_boss = 6), 'Départage public.', 'la décision publique reste');

select is((select count(*) from public.reception where participation_id = '30000000-0000-4000-8000-0000000000b4'), 0::bigint, 'réception effacée');
select is((select count(*) from public.decision where participation_id = '30000000-0000-4000-8000-0000000000b4' and type = 'fermeture_compte'), 0::bigint,
  'décision privée effacée');
select is((select commentaire from public.vote_boss where participation_id = '30000000-0000-4000-8000-0000000000b4'), null, 'commentaire du Boss effacé');
select is((select verrouille_le is not null from public.vote_boss where participation_id = '30000000-0000-4000-8000-0000000000b4'), true, 'le vote reste verrouillé');
select is((select (chemin_stockage, presentation, demande, sha256, fichiers_exclus, outils_ia, traces_ia, faits, alerte_manipulation,
  alertes_integrite, contact_reutilisation)::text from public.depot where participation_id = '30000000-0000-4000-8000-0000000000b4'),
  '(,[effacé],,' || repeat('0', 64) || ',[],[],[],,f,[],f)', 'le dépôt est vidé colonne par colonne');
select is((select resultat from public.audit where jure = 'pitch' and depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-0000000000b4')),
  '{"criteres":[{"cle":"brief","note":8},{"cle":"finition","note":8}]}'::jsonb, 'l''audit ne garde que la clé et la note de chaque critère');
select is((select note_outillage from public.depot where participation_id = '30000000-0000-4000-8000-0000000000b4'), 8, 'la note d''outillage reste');

-- Un autre compte n'est pas touché, et le vote verrouillé reste gelé pour tous les autres cas.
select is((select count(*) from public.participation where compte_id = '10000000-0000-4000-8000-00000000000a'), 2::bigint, 'Alice garde ses participations');
select is((select presentation from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a'), 'Présentation fictive.', 'et son dépôt');
select throws_ok($$update public.vote_boss set note = 1 where participation_id = '30000000-0000-4000-8000-00000000004a'$$,
  'P0001', 'Le vote est verrouillé : il ne se modifie plus.', 'un vote verrouillé ne change toujours pas');
select throws_ok($$delete from public.vote_boss where participation_id = '30000000-0000-4000-8000-00000000004a'$$,
  'P0001', 'Le vote est verrouillé : il ne se modifie plus.', 'ni ne se supprime');
select is((select count(*) from public.classement where pseudo = 'seed_alice'), 1::bigint, 'la ligne d''Alice est intacte');

select * from finish();
rollback;
