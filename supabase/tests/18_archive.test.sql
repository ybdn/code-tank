-- Archive filtrée et alertes du Boss juge (story 5.1, AD-9) : droits de telechargement, depots_du_boss et
-- journaliser_telechargement, par rôle (Boss juge, Boss joueur, candidat, autre compte, visiteur, rôle de service).
-- Boss J (campagne J, juge), Boss K (campagne K, joueur), candidat C (inscrit de J et de K), autre compte A, compte en attente E,
-- admin D (pas Boss).
-- J : dépôt d1 de C (archive filtrée, alertes) et dépôt d2 sans compte ni archive filtrée ; K : dépôt d3 de C.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

insert into auth.users (id, email)
select ('98000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org' from unnest(array['b1', 'b2', 'cc', 'aa', 'ee', 'ad']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('98000000-0000-4000-8000-0000000000' || h)::uuid, '98' || h, 'arch_' || h, now(), '2026-11-25', now(),
  case h when 'ee' then 'en_attente' else 'actif' end
from unnest(array['b1', 'b2', 'cc', 'aa', 'ee', 'ad']) h;
update public.compte set role = 'admin' where id = '98000000-0000-4000-8000-0000000000ad';
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
select s, ('98000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], 'publique', r, 10,
  now() - interval '2 days', now() - interval '1 day', now() + interval '5 days'
from (values ('archj', 'b1', 'juge'), ('archk', 'b2', 'joueur')) v(s, b, r);
update public.campagne set statut = 'ouverte' where slug like 'arch%';
select set_config('t.' || substr(slug, 5), id::text, true) from public.campagne where slug like 'arch%';

insert into public.participation (id, campagne_id, compte_id, connaissance_envoi_le) values
  ('98000000-0000-4000-8000-0000000000f1', current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000cc', now()),
  ('98000000-0000-4000-8000-0000000000f2', current_setting('t.j')::uuid, null, now()),
  ('98000000-0000-4000-8000-0000000000f3', current_setting('t.k')::uuid, '98000000-0000-4000-8000-0000000000cc', now());
insert into public.depot (id, participation_id, chemin_stockage, chemin_filtre, sha256, nb_fichiers, nb_tokens_estime,
  alerte_manipulation, alertes_integrite, presentation, droit_declare_le)
select ('98000000-0000-4000-8000-0000000000d' || n)::uuid, ('98000000-0000-4000-8000-0000000000f' || n)::uuid,
  'aaaaaaaa-0000-4000-8000-00000000000' || n || '/bbbbbbbb-0000-4000-8000-000000000000/cccccccc-0000-4000-8000-000000000000.zip',
  case when n <> 2 then 'aaaaaaaa-0000-4000-8000-00000000000' || n || '/bbbbbbbb-0000-4000-8000-000000000000/cccccccc-0000-4000-8000-000000000000.filtre.zip' end,
  repeat('a', 64), 1, 100, n = 1, case n when 1 then '[{"type": "postinstall", "fichier": "package.json", "ligne": 3}]'::jsonb
    when 2 then (select jsonb_agg(jsonb_build_object('type', 'fichier minifié', 'fichier', 'm' || i || '.js')) from generate_series(1, 7) i)
      || '[{"type": "postinstall", "fichier": "package.json", "ligne": 2}]'::jsonb
    else '[]'::jsonb end,
  'Présentation', now()
from generate_series(1, 3) n;

-- Droits : telechargement fermé à tous, rôle de service compris ; les deux fonctions, authenticated seul.
select ok((select relrowsecurity from pg_class where oid = 'public.telechargement'::regclass), 'telechargement : RLS active');
select is_empty($$
  select r from unnest(array['anon', 'authenticated', 'service_role']) r
  where has_table_privilege(r, 'public.telechargement', 'select,insert,update,delete,truncate,references,trigger')
$$, 'telechargement : aucun droit pour anon, authenticated ni le rôle de service');
select is_empty($$select 1 from pg_policies where tablename = 'telechargement'$$, 'telechargement : aucune politique');
select is_empty($$
  select f, r from unnest(array['public.journaliser_telechargement(uuid, uuid)', 'public.depots_du_boss(uuid)']) f,
    unnest(array['anon', 'service_role']) r where has_function_privilege(r, f, 'execute')
$$, 'anon et le rôle de service n''exécutent ni journaliser_telechargement ni depots_du_boss');
select ok(has_function_privilege('authenticated', 'public.journaliser_telechargement(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.depots_du_boss(uuid)', 'execute'), 'authenticated exécute les deux');
select is_empty($$
  select 1 from information_schema.routine_privileges where grantee = 'PUBLIC'
    and routine_name in ('journaliser_telechargement', 'depots_du_boss')
$$, 'PUBLIC n''exécute aucune des deux');

-- Campagne ouverte : rien, même pour le Boss juge.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is_empty($$select * from public.depots_du_boss(current_setting('t.j')::uuid)$$, 'ouverte : le Boss juge ne lit aucun dépôt');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  'CT404', 'Archive introuvable.', 'ouverte : le Boss juge ne télécharge pas');
reset role;
update public.campagne set statut = 'deliberation' where slug like 'arch%';

-- Boss juge : la liste avec alertes, puis le téléchargement journalisé.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select results_eq($$select participation_id, depot_id, pseudo, alerte_manipulation, alertes_integrite, archive_disponible
    from public.depots_du_boss(current_setting('t.j')::uuid) order by depot_id$$,
  $$values ('98000000-0000-4000-8000-0000000000f1'::uuid, '98000000-0000-4000-8000-0000000000d1'::uuid, 'arch_cc'::text, true,
      '[{"type": "postinstall", "nb": 1, "exemples": [{"fichier": "package.json", "ligne": 3}]}]'::jsonb, true),
    ('98000000-0000-4000-8000-0000000000f2'::uuid, '98000000-0000-4000-8000-0000000000d2'::uuid, null::text, false,
      '[{"type": "fichier minifié", "nb": 7, "exemples": [{"fichier": "m1.js"}, {"fichier": "m2.js"}, {"fichier": "m3.js"}, {"fichier": "m4.js"}, {"fichier": "m5.js"}]},
        {"type": "postinstall", "nb": 1, "exemples": [{"fichier": "package.json", "ligne": 2}]}]'::jsonb, false)$$,
  'Boss juge : chaque dépôt, ses alertes regroupées par type (nombre, cinq exemples au plus) et la disponibilité de l''archive filtrée');
select is_empty($$select * from public.depots_du_boss(current_setting('t.k')::uuid)$$, 'Boss juge : rien d''une autre campagne');
select is(public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1'),
  'aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000000/cccccccc-0000-4000-8000-000000000000.filtre.zip',
  'Boss juge : le chemin de l''archive filtrée');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d2')$$,
  'CT404', 'Archive introuvable.', 'Boss juge : pas d''archive filtrée, 404');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d3')$$,
  'CT404', 'Archive introuvable.', 'Boss juge : dépôt d''une autre campagne, 404');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.k')::uuid, '98000000-0000-4000-8000-0000000000d3')$$,
  'CT404', 'Archive introuvable.', 'Boss juge : campagne d''un autre Boss, 404');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, gen_random_uuid())$$,
  'CT404', 'Archive introuvable.', 'Boss juge : dépôt inconnu, 404');
select throws_ok($$select * from public.telechargement$$, '42501', null, 'Boss juge : ne lit pas le journal');
select throws_ok($$insert into public.telechargement (campagne_id, compte_id) values (current_setting('t.j')::uuid, auth.uid())$$,
  '42501', null, 'Boss juge : n''écrit pas le journal directement');
reset role;
select results_eq($$select campagne_id, depot_id, compte_id, telecharge_le <= now() from public.telechargement$$,
  $$values (current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1'::uuid, '98000000-0000-4000-8000-0000000000b1'::uuid, true)$$,
  'une seule ligne : qui, quoi, quand ; aucune pour les refus');

-- Boss joueur : la liste sans alertes ; aucun téléchargement.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select results_eq($$select depot_id, pseudo, alerte_manipulation, alertes_integrite, archive_disponible from public.depots_du_boss(current_setting('t.k')::uuid)$$,
  $$values ('98000000-0000-4000-8000-0000000000d3'::uuid, 'arch_cc'::text, null::boolean, null::jsonb, null::boolean)$$,
  'Boss joueur : ni alertes ni archive');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.k')::uuid, '98000000-0000-4000-8000-0000000000d3')$$,
  'CT404', 'Archive introuvable.', 'Boss joueur : 404');
select is_empty($$select * from public.depots_du_boss(current_setting('t.j')::uuid)$$, 'Boss joueur : rien de la campagne d''un autre');

-- Candidat (inscrit de J et K) et autre compte : rien.
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-0000000000cc","role":"authenticated"}', true);
select is_empty($$select * from public.depots_du_boss(current_setting('t.j')::uuid)$$, 'candidat : aucune ligne');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  'CT404', 'Archive introuvable.', 'candidat : 404, même pour son dépôt');
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
select is_empty($$select * from public.depots_du_boss(current_setting('t.j')::uuid)$$, 'autre compte : aucune ligne');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  'CT404', 'Archive introuvable.', 'autre compte : 404');
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-0000000000ee","role":"authenticated"}', true);
select is_empty($$select * from public.depots_du_boss(current_setting('t.j')::uuid)$$, 'compte en attente : aucune ligne');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  'CT404', 'Archive introuvable.', 'compte en attente : 404');
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-0000000000ad","role":"authenticated"}', true);
select is_empty($$select * from public.depots_du_boss(current_setting('t.j')::uuid)$$, 'admin (pas Boss) : aucune ligne');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  'CT404', 'Archive introuvable.', 'admin (pas Boss) : 404');
reset role;

-- Visiteur et rôle de service : pas même l'exécution.
set local role anon;
select throws_ok($$select * from public.depots_du_boss(current_setting('t.j')::uuid)$$, '42501', null, 'visiteur : depots_du_boss refusée');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  '42501', null, 'visiteur : journaliser_telechargement refusée');
select throws_ok($$select * from public.telechargement$$, '42501', null, 'visiteur : ne lit pas le journal');
reset role;
set local role service_role;
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  '42501', null, 'rôle de service : journaliser_telechargement refusée');
select throws_ok($$select * from public.telechargement$$, '42501', null, 'rôle de service : ne lit pas le journal');
reset role;

-- prete : toujours permis ; bloquée, échue ou compte suspendu : 404.
update public.campagne set statut = 'prete' where slug like 'arch%';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select isnt(public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1'), null, 'prete : le Boss juge télécharge');
select is((select count(*)::integer from public.depots_du_boss(current_setting('t.j')::uuid)), 2, 'prete : le Boss juge lit ses dépôts');
reset role;
-- publiee : plus rien (déclencheur coupé le temps des allers-retours d'étape).
alter table public.campagne disable trigger campagne_transition;
update public.campagne set statut = 'publiee' where slug = 'archj';
set local role authenticated;
select is_empty($$select * from public.depots_du_boss(current_setting('t.j')::uuid)$$, 'publiee : le Boss juge ne lit aucun dépôt');
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  'CT404', 'Archive introuvable.', 'publiee : 404');
reset role;
update public.campagne set statut = 'prete' where slug = 'archj';
alter table public.campagne enable trigger campagne_transition;
update public.campagne set bloquee_le = now(), motif_blocage = 'Motif' where slug = 'archj';
set local role authenticated;
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  'CT404', 'Archive introuvable.', 'bloquée : 404');
reset role;
update public.campagne set bloquee_le = null, motif_blocage = null where slug = 'archj';
update public.compte set etat = 'suspendu' where id = '98000000-0000-4000-8000-0000000000b1';
set local role authenticated;
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  'CT404', 'Archive introuvable.', 'compte suspendu : 404');
reset role;
update public.compte set etat = 'actif' where id = '98000000-0000-4000-8000-0000000000b1';
update public.campagne set ouverture_inscriptions = now() - interval '3 days', cloture_depot = now() - interval '2 days',
  date_resultats = now() - interval '1 minute' where slug = 'archj';
set local role authenticated;
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d1')$$,
  'CT404', 'Archive introuvable.', 'échue : 404');
reset role;
select is((select count(*)::integer from public.telechargement), 2, 'deux téléchargements permis, aucune ligne pour les refus');

-- La trace survit au retrait du dépôt et à la participation retirée ; une participation retirée ne se télécharge plus.
update public.campagne set ouverture_inscriptions = now() - interval '2 days', cloture_depot = now() - interval '1 day',
  date_resultats = now() + interval '5 days' where slug = 'archj';
update public.depot set chemin_filtre = 'aaaaaaaa-0000-4000-8000-000000000002/bbbbbbbb-0000-4000-8000-000000000000/cccccccc-0000-4000-8000-000000000000.filtre.zip'
  where id = '98000000-0000-4000-8000-0000000000d2';
update public.participation set etat = 'retire', retire_le = now() where id = '98000000-0000-4000-8000-0000000000f2';
set local role authenticated;
select throws_ok($$select public.journaliser_telechargement(current_setting('t.j')::uuid, '98000000-0000-4000-8000-0000000000d2')$$,
  'CT404', 'Archive introuvable.', 'participation retirée : 404, même avec une archive filtrée');
select is((select count(*)::integer from public.depots_du_boss(current_setting('t.j')::uuid)), 1, 'participation retirée : son dépôt n''est plus listé');
reset role;
delete from public.depot where id = '98000000-0000-4000-8000-0000000000d1';
select is((select count(*)::integer from public.telechargement where depot_id is null), 2, 'dépôt effacé : les traces restent, depot_id nul');

select * from finish();
rollback;
