-- Contrôle des réceptions par prive (story 3.4) : noter_tentative_reception, refuser_reception et accepter_depot, réservées
-- au rôle de service ; lecture directe de prive par colonnes ; ce que le candidat lit du dépôt accepté. Rôles : visiteur,
-- candidat (A1), rôle de service. Dates relatives à now() pour la phase de dépôt, now() seulement pour « échue ».
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, email)
select ('92000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org' from unnest(array['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('92000000-0000-4000-8000-0000000000' || h)::uuid, '92' || h, 'ctrl_' || h, now(), '2026-11-25', now(), 'actif'
from unnest(array['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']) h;
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
select s, ('92000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], 'publique', 'juge', 5, o, c, d
from (values
  ('ccpub', 'b1', now() - interval '1 day', now() + interval '10 days', now() + interval '20 days'),
  ('ccdelib', 'b2', now() - interval '1 day', now() + interval '10 days', now() + interval '20 days'),
  ('ccbloq', 'b3', now() - interval '1 day', now() + interval '10 days', now() + interval '20 days'),
  ('ccechue', 'b4', now() - interval '3 days', now() - interval '2 days', now() - interval '1 day')) v(s, b, o, c, d);
update public.campagne set statut = 'ouverte' where slug like 'cc%';
update public.campagne set statut = 'deliberation' where slug = 'ccdelib';
update public.campagne set bloquee_le = now(), motif_blocage = 'Essai' where slug = 'ccbloq';
select set_config('t.' || substr(slug, 3), id::text, true) from public.campagne where slug like 'cc%';

-- f1 : A1 à pub ; f2 : A2 à pub ; f3, f4, f5 : A3 à delib, bloq, echue.
insert into public.participation (id, campagne_id, compte_id, connaissance_envoi_le) values
  ('92000000-0000-4000-8000-0000000000f1', current_setting('t.pub')::uuid, '92000000-0000-4000-8000-0000000000a1', now()),
  ('92000000-0000-4000-8000-0000000000f2', current_setting('t.pub')::uuid, '92000000-0000-4000-8000-0000000000a2', now()),
  ('92000000-0000-4000-8000-0000000000f3', current_setting('t.delib')::uuid, '92000000-0000-4000-8000-0000000000a3', now()),
  ('92000000-0000-4000-8000-0000000000f4', current_setting('t.bloq')::uuid, '92000000-0000-4000-8000-0000000000a3', now()),
  ('92000000-0000-4000-8000-0000000000f5', current_setting('t.echue')::uuid, '92000000-0000-4000-8000-0000000000a3', now());
-- Chemins <campagne>/<participation>/<uuid>.zip : z1 et z2 pour A1 (deux dépôts successifs), z3 pour A2, z4 à z6 pour A3.
select set_config('t.z' || n, current_setting('t.' || c) || '/92000000-0000-4000-8000-0000000000' || f || '/9b000000-0000-4000-8000-00000000000' || n || '.zip', true)
from (values (1, 'pub', 'f1'), (2, 'pub', 'f1'), (3, 'pub', 'f2'), (4, 'delib', 'f3'), (5, 'bloq', 'f4'), (6, 'echue', 'f5')) v(n, c, f);
insert into storage.objects (bucket_id, name)
select 'depots', current_setting('t.z' || n) from generate_series(1, 6) n
union all select 'depots', replace(current_setting('t.z' || n), '.zip', '.filtre.zip') from unnest(array[2, 4, 5, 6]) n;
-- Réceptions en attente, posées comme deposer les écrit ; r3 (A2) sert au refus.
insert into public.reception (id, participation_id, chemin_stockage, presentation, demande, droit_declare_le)
select ('92000000-0000-4000-8000-0000000000e' || n)::uuid, ('92000000-0000-4000-8000-0000000000' || f)::uuid,
  current_setting('t.z' || n), 'Présentation ' || n, case n when 1 then 'Je vise 8/10' end, timestamptz '2026-11-20 10:00 Europe/Paris'
from (values (1, 'f1'), (3, 'f2'), (4, 'f3'), (5, 'f4'), (6, 'f5')) v(n, f);
create temp table mesure (b text, c integer, d jsonb, e integer, f jsonb, g integer, h boolean, i jsonb) on commit drop;
grant select on mesure to service_role;
insert into mesure values (repeat('c', 64), 3, '[{"chemin": "logo.png", "raison": "image"}]', 1200, '{"tests": 2}', 7, true,
  '[{"type": "réseau", "fichier": "a.ts"}]');

-- Droits ---------------------------------------------------------------------------------------------------------------
select results_eq($$select r, f, has_function_privilege(r, f, 'execute') from unnest(array['anon', 'authenticated', 'service_role']) r,
  unnest(array['public.noter_tentative_reception(uuid)', 'public.refuser_reception(uuid, jsonb)',
    'public.accepter_depot(uuid, text, text, integer, jsonb, integer, jsonb, integer, boolean, jsonb)']) f order by 1, 2$$,
  $$select r, f, r = 'service_role' from unnest(array['anon', 'authenticated', 'service_role']) r,
  unnest(array['public.noter_tentative_reception(uuid)', 'public.refuser_reception(uuid, jsonb)',
    'public.accepter_depot(uuid, text, text, integer, jsonb, integer, jsonb, integer, boolean, jsonb)']) f order by 1, 2$$,
  'les trois fonctions de prive : rôle de service seul');
select is((select string_agg(table_name || '.' || column_name || ':' || privilege_type, ' ' order by table_name, column_name, privilege_type)
  from information_schema.column_privileges
  where grantee = 'service_role' and table_schema = 'public' and table_name in ('reception', 'depot', 'participation', 'campagne')),
  'campagne.bloquee_le:SELECT campagne.date_resultats:SELECT campagne.id:SELECT campagne.statut:SELECT participation.campagne_id:SELECT '
  || 'participation.id:SELECT reception.chemin_stockage:SELECT reception.cree_le:SELECT reception.id:SELECT '
  || 'reception.participation_id:SELECT reception.statut:SELECT',
  'rôle de service : lecture des seules colonnes de prive, aucune écriture, rien sur depot');
select is_empty($$select t from unnest(array['public.reception', 'public.depot', 'public.participation', 'public.campagne']) t
  where has_table_privilege('service_role', t, 'select,insert,update,delete,truncate,references,trigger')$$,
  'rôle de service : aucun droit de table sur reception, depot, participation ni campagne');
select ok(bool_and(pg_get_functiondef(f) ~ 'for update of c'), 'les trois fonctions verrouillent la ligne campagne')
from unnest(array['public.noter_tentative_reception(uuid)'::regprocedure, 'public.refuser_reception(uuid, jsonb)'::regprocedure,
  'public.accepter_depot(uuid, text, text, integer, jsonb, integer, jsonb, integer, boolean, jsonb)'::regprocedure]) f;

set local role anon;
select throws_ok($$select public.noter_tentative_reception('92000000-0000-4000-8000-0000000000e1')$$, '42501', null, 'le visiteur ne note pas de tentative');
select throws_ok($$select public.refuser_reception('92000000-0000-4000-8000-0000000000e1', '[]')$$, '42501', null, 'le visiteur ne refuse pas de réception');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"92000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.noter_tentative_reception('92000000-0000-4000-8000-0000000000e1')$$, '42501', null, 'le candidat ne note pas de tentative');
select throws_ok($$select public.refuser_reception('92000000-0000-4000-8000-0000000000e1', '[{"code": "x", "message": "x"}]')$$, '42501', null, 'le candidat ne refuse pas sa réception');
select throws_ok($$select public.accepter_depot('92000000-0000-4000-8000-0000000000e1', 'x', repeat('c', 64), 1, '[]', 1, null, 0, false, '[]')$$,
  '42501', null, 'le candidat n''accepte pas son dépôt');
reset role;

-- Lecture directe de prive -----------------------------------------------------------------------------------------------
set local role service_role;
select results_eq($$select r.id, r.statut, c.statut from public.reception r join public.participation p on p.id = r.participation_id
  join public.campagne c on c.id = p.campagne_id where r.id = '92000000-0000-4000-8000-0000000000e4'$$,
  $$values ('92000000-0000-4000-8000-0000000000e4'::uuid, 'en_attente', 'deliberation')$$, 'prive lit la réception et l''état de sa campagne');
select throws_ok($$select presentation from public.reception$$, '42501', null, 'prive ne lit pas la présentation');
select throws_ok($$select tentatives from public.reception$$, '42501', null, 'prive ne lit pas les tentatives (noter_tentative_reception les rend)');
select throws_ok($$select 1 from public.depot$$, '42501', null, 'prive ne lit pas depot');
select throws_ok($$select compte_id from public.participation$$, '42501', null, 'prive ne lit pas le compte d''une participation');
select throws_ok($$update public.reception set statut = 'refusee'$$, '42501', null, 'prive n''écrit pas reception directement');
select throws_ok($$insert into public.depot (participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, presentation, droit_declare_le)
  values ('92000000-0000-4000-8000-0000000000f1', current_setting('t.z1'), repeat('c', 64), 1, 1, 'x', now())$$, '42501', null, 'prive n''écrit pas depot directement');

-- Tentatives -------------------------------------------------------------------------------------------------------------
select is(public.noter_tentative_reception('92000000-0000-4000-8000-0000000000e1'), 1, 'première tentative');
select is(public.noter_tentative_reception('92000000-0000-4000-8000-0000000000e1'), 2, 'deuxième tentative');
select is(public.noter_tentative_reception(gen_random_uuid()), null, 'réception inconnue : null');

-- Refus ------------------------------------------------------------------------------------------------------------------
select throws_ok($$select public.refuser_reception('92000000-0000-4000-8000-0000000000e3', '[]')$$, 'P0001', 'Motifs de refus mal formés.', 'motifs vides : refus');
select throws_ok($$select public.refuser_reception('92000000-0000-4000-8000-0000000000e3', '{"code": "x"}')$$, 'P0001', 'Motifs de refus mal formés.', 'motifs hors tableau : refus');
select throws_ok($$select public.refuser_reception('92000000-0000-4000-8000-0000000000e3', '[{"code": "SECRETS", "message": "x"}, {"code": "SECRETS"}]')$$, 'P0001', 'Motifs de refus mal formés.', 'motif sans message : refus');
select throws_ok($$select public.refuser_reception('92000000-0000-4000-8000-0000000000e3', null)$$, 'P0001', 'Motifs de refus mal formés.', 'motifs absents : refus');
select is(public.refuser_reception('92000000-0000-4000-8000-0000000000e3', '[{"code": "SECRETS", "message": "Retire tes secrets et redépose."}]'),
  current_setting('t.z3'), 'refus : rend le chemin du zip à effacer');
reset role;
select results_eq($$select statut, motifs from public.reception where id = '92000000-0000-4000-8000-0000000000e3'$$,
  $$values ('refusee', '[{"code": "SECRETS", "message": "Retire tes secrets et redépose."}]'::jsonb)$$, 'la réception est refusée avec ses motifs');
set local role service_role;
select is(public.refuser_reception('92000000-0000-4000-8000-0000000000e3', '[{"code": "x", "message": "x"}]'), null, 'déjà refusée : null, rien ne change');
select is(public.noter_tentative_reception('92000000-0000-4000-8000-0000000000e3'), null, 'refusée : plus de tentative');
select throws_ok($$select public.accepter_depot('92000000-0000-4000-8000-0000000000e3', replace(current_setting('t.z3'), '.zip', '.filtre.zip'), b, c, d, e, f, g, h, i) from mesure$$,
  'CT404', 'Réception introuvable ou déjà traitée.', 'réception refusée : pas d''acceptation');

-- Acceptation ------------------------------------------------------------------------------------------------------------
select throws_ok($$select public.accepter_depot('92000000-0000-4000-8000-0000000000e4', replace(current_setting('t.z4'), '.zip', '.filtre.zip'), b, c, d, e, f, g, h, i) from mesure$$,
  'CT409', 'La campagne n''accepte plus de dépôt.', 'campagne en délibération : refus');
select throws_ok($$select public.accepter_depot('92000000-0000-4000-8000-0000000000e5', replace(current_setting('t.z5'), '.zip', '.filtre.zip'), b, c, d, e, f, g, h, i) from mesure$$,
  'CT409', 'La campagne n''accepte plus de dépôt.', 'campagne bloquée : refus');
select throws_ok($$select public.accepter_depot('92000000-0000-4000-8000-0000000000e6', replace(current_setting('t.z6'), '.zip', '.filtre.zip'), b, c, d, e, f, g, h, i) from mesure$$,
  'CT409', 'La campagne n''accepte plus de dépôt.', 'campagne échue : refus');
select throws_ok($$select public.accepter_depot('92000000-0000-4000-8000-0000000000e1', replace(current_setting('t.z2'), '.zip', '.filtre.zip'), b, c, d, e, f, g, h, i) from mesure$$,
  'P0001', 'Archive filtrée absente.', 'archive filtrée d''un autre zip : refus');
select throws_ok($$select public.accepter_depot('92000000-0000-4000-8000-0000000000e1', null, b, c, d, e, f, g, h, i) from mesure$$,
  'P0001', 'Archive filtrée absente.', 'sans archive filtrée : refus');
select throws_ok($$select public.accepter_depot('92000000-0000-4000-8000-0000000000e1', replace(current_setting('t.z1'), '.zip', '.filtre.zip'), b, c, d, e, f, g, h, i) from mesure$$,
  'P0001', 'Archive filtrée absente.', 'archive filtrée pas arrivée dans le bucket : refus');
reset role;
insert into storage.objects (bucket_id, name) values ('depots', replace(current_setting('t.z1'), '.zip', '.filtre.zip'));
set local role service_role;
select throws_ok($$select public.accepter_depot('92000000-0000-4000-8000-0000000000e1', replace(current_setting('t.z1'), '.zip', '.filtre.zip'), b, c, d, 100001, f, g, h, i) from mesure$$,
  '23514', null, 'plus de 100 000 tokens estimés : refus de la table');
select is(public.accepter_depot('92000000-0000-4000-8000-0000000000e1', replace(current_setting('t.z1'), '.zip', '.filtre.zip'), b, c, d, e, f, g, h, i),
  '{}'::text[], 'premier dépôt : rien à effacer') from mesure;
reset role;
select results_eq($$select participation_id, chemin_stockage, chemin_filtre, sha256, nb_fichiers, fichiers_exclus, nb_tokens_estime, faits,
  note_outillage, alerte_manipulation, alertes_integrite, presentation, demande, droit_declare_le, nb_tokens_exact, trop_gros from public.depot$$,
  $$values ('92000000-0000-4000-8000-0000000000f1'::uuid, current_setting('t.z1'), replace(current_setting('t.z1'), '.zip', '.filtre.zip'),
    repeat('c', 64), 3, '[{"chemin": "logo.png", "raison": "image"}]'::jsonb, 1200, '{"tests": 2}'::jsonb, 7, true,
    '[{"type": "réseau", "fichier": "a.ts"}]'::jsonb, 'Présentation 1', 'Je vise 8/10', timestamptz '2026-11-20 10:00 Europe/Paris', null::integer, false)$$,
  'le dépôt porte les mesures de prive et la déclaration recopiée de la réception');
select is_empty($$select 1 from public.reception where id = '92000000-0000-4000-8000-0000000000e1'$$, 'la réception acceptée disparaît');

-- Ce que le candidat lit (CA8, CA9) --------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"92000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select results_eq($$select nb_fichiers, jsonb_array_length(fichiers_exclus), nb_tokens_estime, sha256 from public.depot$$,
  $$values (3, 1, 1200, repeat('c', 64))$$, 'le candidat lit fichiers retenus et exclus, tokens estimés et empreinte');
select throws_ok($$select alerte_manipulation from public.depot$$, '42501', null, 'le candidat ne lit pas l''alerte de manipulation');
select throws_ok($$select alertes_integrite from public.depot$$, '42501', null, 'le candidat ne lit pas les alertes d''intégrité');
select throws_ok($$select faits from public.depot$$, '42501', null, 'le candidat ne lit pas les faits');
select throws_ok($$select note_outillage from public.depot$$, '42501', null, 'le candidat ne lit pas la note d''outillage');
reset role;

-- Remplacement : un nouveau dépôt d'A1 rend les archives de l'ancien (AD-11) --------------------------------------------
insert into public.reception (id, participation_id, chemin_stockage, presentation, droit_declare_le)
values ('92000000-0000-4000-8000-0000000000e2', '92000000-0000-4000-8000-0000000000f1', current_setting('t.z2'), 'Version 2', now());
set local role service_role;
select is(public.accepter_depot('92000000-0000-4000-8000-0000000000e2', replace(current_setting('t.z2'), '.zip', '.filtre.zip'), repeat('d', 64), 1, '[]', 10, null, 0, false, '[]'),
  array[current_setting('t.z1'), replace(current_setting('t.z1'), '.zip', '.filtre.zip')], 'remplacement : rend le zip et l''archive filtrée de l''ancien dépôt');
reset role;
select results_eq($$select chemin_stockage, presentation, demande, sha256 from public.depot where participation_id = '92000000-0000-4000-8000-0000000000f1'$$,
  $$values (current_setting('t.z2'), 'Version 2', null::text, repeat('d', 64))$$, 'un seul dépôt : le nouveau');
select is((select count(*) from public.depot), 1::bigint, 'aucun autre dépôt écrit');
select is((select count(*) from public.reception where statut = 'en_attente'), 3::bigint, 'les réceptions des campagnes closes restent en attente');

select * from finish();
rollback;
