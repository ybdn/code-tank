-- Délibération (story 4.2) : table audit (colonnes, contraintes, droits par rôle) et estimer_pire_cas (formule sur un jeu
-- connu, avec et sans audits, droits et refus). Par audit à envoyer : (tokens × 4 $ × 2 + 15 000 × 20 $) / 1 M / 2.
-- Rôles : visiteur, Boss (B1), autre Boss (B2), candidat (A1), rôle de service.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email)
select ('93000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org' from unnest(array['a1', 'a2', 'a3', 'b1', 'b2', 'b3']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('93000000-0000-4000-8000-0000000000' || h)::uuid, '93' || h, 'audit_' || h, now(), '2026-11-25', now(), 'actif'
from unnest(array['a1', 'a2', 'a3', 'b1', 'b2', 'b3']) h;
-- X : campagne du jeu connu (B1) ; Y : celle de B2 ; Z : contrôle à 10 dépôts de 100 000 tokens (B3).
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
select s, ('93000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], 'publique', 'juge', 10,
  now() - interval '2 days', now() - interval '1 day', now() + interval '5 days'
from (values ('auditx', 'b1'), ('audity', 'b2'), ('auditz', 'b3')) v(s, b);
update public.campagne set statut = 'ouverte' where slug like 'audit%';
select set_config('t.' || substr(slug, 6), id::text, true) from public.campagne where slug like 'audit%';

-- Participations : A1, A2, A3 à X (A3 sans dépôt n'en a pas d'autre), A1 à Y, dix participations sans compte à Z.
insert into public.participation (id, campagne_id, compte_id, connaissance_envoi_le) values
  ('93000000-0000-4000-8000-0000000000f1', current_setting('t.x')::uuid, '93000000-0000-4000-8000-0000000000a1', now()),
  ('93000000-0000-4000-8000-0000000000f2', current_setting('t.x')::uuid, '93000000-0000-4000-8000-0000000000a2', now()),
  ('93000000-0000-4000-8000-0000000000f3', current_setting('t.x')::uuid, '93000000-0000-4000-8000-0000000000a3', now()),
  ('93000000-0000-4000-8000-0000000000f5', current_setting('t.y')::uuid, '93000000-0000-4000-8000-0000000000a1', now());
insert into public.participation (campagne_id, compte_id, connaissance_envoi_le)
select current_setting('t.z')::uuid, null, now() from generate_series(1, 10);

-- Dépôts : d1 (exact 100 000, estimé 50 000 : 0,55 $ par audit), d2 (estimé 20 000 seul : 0,23 $), d3 (trop_gros : exclu),
-- d5 à Y (estimé 100 000 : 0,55 $), dix dépôts de 100 000 tokens exacts à Z.
insert into public.depot (id, participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, nb_tokens_exact, trop_gros,
  presentation, droit_declare_le)
select ('93000000-0000-4000-8000-0000000000d' || n)::uuid, ('93000000-0000-4000-8000-0000000000f' || n)::uuid,
  gen_random_uuid() || '/' || gen_random_uuid() || '/' || gen_random_uuid() || '.zip', repeat('a', 64), 1, e, x, g, 'Présentation', now()
from (values (1, 50000, 100000, false), (2, 20000, null, false), (3, 90000, null, true), (5, 100000, null, false)) v(n, e, x, g);
insert into public.depot (participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, nb_tokens_exact, presentation,
  droit_declare_le)
select p.id, gen_random_uuid() || '/' || gen_random_uuid() || '/' || gen_random_uuid() || '.zip', repeat('a', 64), 1, 40000, 100000,
  'Présentation', now()
from public.participation p where p.campagne_id = current_setting('t.z')::uuid;

-- Table audit.
select columns_are('public', 'audit', array['id', 'depot_id', 'jure', 'modele', 'version_consignes', 'batch_id', 'statut',
  'resultat', 'replique_masquee', 'usage', 'cout_usd', 'tentatives', 'cree_le'], 'audit porte les colonnes d''AD-5');
select col_default_is('public', 'audit', 'statut', 'a_envoyer', 'un audit naît a_envoyer');
select throws_ok($$insert into public.audit (depot_id, jure) values ('93000000-0000-4000-8000-0000000000d1', 'jury')$$, '23514', null,
  'juré hors des quatre : refus');
select throws_ok($$insert into public.audit (depot_id, jure, statut) values ('93000000-0000-4000-8000-0000000000d1', 'sudo', 'envoye')$$,
  '23514', null, 'statut hors liste : refus');
select throws_ok($$insert into public.audit (depot_id, jure, cout_usd) values ('93000000-0000-4000-8000-0000000000d1', 'sudo', -1)$$,
  '23514', null, 'coût négatif : refus');
insert into public.audit (depot_id, jure) values ('93000000-0000-4000-8000-0000000000d5', 'sudo');
select throws_ok($$insert into public.audit (depot_id, jure) values ('93000000-0000-4000-8000-0000000000d5', 'sudo')$$, '23505', null,
  'un seul audit par dépôt et par juré');
delete from public.audit;

-- Droits sur audit : rien pour anon et authenticated ; le rôle de service lit seulement.
select is_empty($$
  select r from unnest(array['anon', 'authenticated']) r
  where has_table_privilege(r, 'public.audit', 'select,insert,update,delete,truncate,references,trigger')
$$, 'audit : aucun droit pour anon ni authenticated');
select is(has_table_privilege('service_role', 'public.audit', 'select'), true, 'le rôle de service lit audit');
select is(has_table_privilege('service_role', 'public.audit', 'insert,update,delete,truncate,references,trigger'), false,
  'le rôle de service n''écrit pas audit directement');
select is_empty($$select policyname from pg_policies where schemaname = 'public' and tablename = 'audit'$$, 'audit : aucune politique');

-- Droits sur estimer_pire_cas.
select is(has_function_privilege('anon', 'public.estimer_pire_cas(uuid)', 'execute'), false, 'anon n''exécute pas estimer_pire_cas');
select is_empty($$select 1 from information_schema.routine_privileges where routine_name = 'estimer_pire_cas' and grantee = 'PUBLIC'$$,
  'PUBLIC n''exécute pas estimer_pire_cas');
select is(has_function_privilege('authenticated', 'public.estimer_pire_cas(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.estimer_pire_cas(uuid)', 'execute'), true,
  'authenticated et le rôle de service exécutent estimer_pire_cas');

-- Formule, sans audit (rôle de service, comme prive).
set local role service_role;
select is(public.estimer_pire_cas(current_setting('t.x')::uuid), 3.12::numeric,
  'X sans audit : 4 × (0,55 $ exact de d1 + 0,23 $ estimé de d2), d3 trop_gros exclu');
select is(public.estimer_pire_cas(current_setting('t.y')::uuid), 2.2::numeric, 'Y : 4 × 0,55 $ sur l''estimé de d5');
select is(public.estimer_pire_cas(current_setting('t.z')::uuid), 22::numeric, 'contrôle SPECS § 6 : 10 dépôts × 4 jurés × 100 000 tokens = 22 $');
select is(public.estimer_pire_cas('93000000-0000-4000-8000-000000000000'), 0::numeric, 'campagne inconnue : 0');
select throws_ok($$insert into public.audit (depot_id, jure) values ('93000000-0000-4000-8000-0000000000d1', 'sudo')$$, '42501', null,
  'le rôle de service n''insère pas d''audit');
select is((select count(*) from public.audit), 0::bigint, 'le rôle de service lit audit (vide)');
reset role;

-- Avec audits : d1 sudo termine et refacto en_cours (exclus), lint echec et pitch a_envoyer (comptés) ; d2 sudo termine
-- (exclu) ; un audit en echec du dépôt trop_gros ne le fait pas compter.
insert into public.audit (depot_id, jure, statut) values
  ('93000000-0000-4000-8000-0000000000d1', 'sudo', 'termine'),
  ('93000000-0000-4000-8000-0000000000d1', 'refacto', 'en_cours'),
  ('93000000-0000-4000-8000-0000000000d1', 'lint', 'echec'),
  ('93000000-0000-4000-8000-0000000000d1', 'pitch', 'a_envoyer'),
  ('93000000-0000-4000-8000-0000000000d2', 'sudo', 'termine'),
  ('93000000-0000-4000-8000-0000000000d3', 'sudo', 'echec');
set local role service_role;
select is(public.estimer_pire_cas(current_setting('t.x')::uuid), 1.79::numeric,
  'X avec audits : 2 × 0,55 $ (echec, a_envoyer) + 3 × 0,23 $ (sans audit) ; termine, en_cours et trop_gros exclus');
reset role;
-- Sans compte exact, l'estimé de d1 compte.
update public.depot set nb_tokens_exact = null where id = '93000000-0000-4000-8000-0000000000d1';
set local role service_role;
select is(public.estimer_pire_cas(current_setting('t.x')::uuid), 1.39::numeric, 'd1 sans compte exact : 2 × 0,35 $ + 3 × 0,23 $');
reset role;

-- Le Boss de la campagne seul, par /rest/v1/rpc comme par la route.
set local role authenticated;
set local request.jwt.claims = '{"sub":"93000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select is(public.estimer_pire_cas(current_setting('t.x')::uuid), 1.39::numeric, 'le Boss de X lit son pire cas');
select throws_ok($$select public.estimer_pire_cas(current_setting('t.y')::uuid)$$, '42501', 'Campagne introuvable.',
  'le Boss de X ne lit pas celui de Y');
select throws_ok($$select 1 from public.audit$$, '42501', null, 'le Boss ne lit pas audit directement');
select throws_ok($$insert into public.audit (depot_id, jure) values ('93000000-0000-4000-8000-0000000000d2', 'lint')$$, '42501', null,
  'le Boss n''écrit pas audit');
set local request.jwt.claims = '{"sub":"93000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.estimer_pire_cas(current_setting('t.x')::uuid)$$, '42501', 'Campagne introuvable.',
  'un candidat ne lit pas le pire cas');
select throws_ok($$select public.estimer_pire_cas('93000000-0000-4000-8000-000000000000')$$, '42501', 'Campagne introuvable.',
  'campagne inconnue : même refus');
reset role;
set local role anon;
select throws_ok($$select public.estimer_pire_cas(current_setting('t.x')::uuid)$$, '42501', null, 'le visiteur n''exécute pas estimer_pire_cas');
select throws_ok($$select 1 from public.audit$$, '42501', null, 'le visiteur ne lit pas audit');
reset role;

select * from finish();
rollback;
