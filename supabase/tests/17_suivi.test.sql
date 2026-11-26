-- Suivi de la délibération et e-mail de fin (story 4.7) : droits, progression_deliberation (Boss seul, compteurs et coût),
-- reserver_envoi (prete seulement, une seule réservation même rejouée), fins_a_prevenir. Boss B1 (campagne P), B2 (campagne Q).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email)
select ('97000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org' from unnest(array['b1', 'b2']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('97000000-0000-4000-8000-0000000000' || h)::uuid, '97' || h, 'suivi_' || h, now(), '2026-11-25', now(), 'actif'
from unnest(array['b1', 'b2']) h;
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
select s, ('97000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], 'publique', 'juge', 10,
  now() - interval '2 days', now() - interval '1 day', now() + interval '5 days'
from (values ('suivip', 'b1'), ('suiviq', 'b2')) v(s, b);
update public.campagne set statut = 'ouverte' where slug like 'suivi%';
update public.campagne set statut = 'deliberation' where slug like 'suivi%';
select set_config('t.' || substr(slug, 6), id::text, true) from public.campagne where slug like 'suivi%';

-- P : un dépôt, quatre audits (un par statut) ; 0,10 $ + 0,25 $ payés.
insert into public.participation (id, campagne_id, compte_id, connaissance_envoi_le)
values ('97000000-0000-4000-8000-0000000000f1', current_setting('t.p')::uuid, null, now());
insert into public.depot (id, participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, presentation, droit_declare_le)
values ('97000000-0000-4000-8000-0000000000d1', '97000000-0000-4000-8000-0000000000f1',
  gen_random_uuid() || '/' || gen_random_uuid() || '/' || gen_random_uuid() || '.zip', repeat('a', 64), 1, 50000, 'Présentation', now());
insert into public.audit (depot_id, jure, statut, cout_usd) values
  ('97000000-0000-4000-8000-0000000000d1', 'sudo', 'termine', 0.10),
  ('97000000-0000-4000-8000-0000000000d1', 'refacto', 'echec', 0.25),
  ('97000000-0000-4000-8000-0000000000d1', 'lint', 'en_cours', null),
  ('97000000-0000-4000-8000-0000000000d1', 'pitch', 'a_envoyer', null);

-- Droits.
select is_empty($$
  select f, r from unnest(array['public.reserver_envoi(uuid)', 'public.fins_a_prevenir()']) f, unnest(array['anon', 'authenticated']) r
  where has_function_privilege(r, f, 'execute')
$$, 'anon et authenticated n''exécutent ni reserver_envoi ni fins_a_prevenir');
select ok(has_function_privilege('service_role', 'public.reserver_envoi(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.fins_a_prevenir()', 'execute'), 'le rôle de service exécute reserver_envoi et fins_a_prevenir');
select is(has_function_privilege('anon', 'public.progression_deliberation(uuid)', 'execute'), false, 'anon n''exécute pas progression_deliberation');
select is(has_function_privilege('service_role', 'public.progression_deliberation(uuid)', 'execute'), false, 'le rôle de service n''exécute pas progression_deliberation');
select ok(has_function_privilege('authenticated', 'public.progression_deliberation(uuid)', 'execute'), 'authenticated exécute progression_deliberation');
select is_empty($$
  select 1 from information_schema.routine_privileges where grantee = 'PUBLIC'
    and routine_name in ('reserver_envoi', 'fins_a_prevenir', 'progression_deliberation')
$$, 'PUBLIC n''exécute aucune des trois');

-- progression_deliberation : le Boss de P lit ses compteurs ; le Boss de Q, refusé (42501) ; Q sans audit : zéros.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"97000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is(public.progression_deliberation(current_setting('t.p')::uuid),
  '{"termines": 1, "en_cours": 1, "echecs": 1, "a_envoyer": 1, "cout_usd": 0.35}'::jsonb, 'le Boss lit sa progression et le coût cumulé');
select is(public.progression_deliberation(current_setting('t.p')::uuid)->'cout_usd', to_jsonb(public.depense_audits(current_setting('t.p')::uuid)),
  'le coût cumulé est celui de depense_audits');
select set_config('request.jwt.claims', '{"sub":"97000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok($$select public.progression_deliberation(current_setting('t.p')::uuid)$$, '42501', 'Campagne introuvable.',
  'un autre Boss ne lit pas la progression');
select is(public.progression_deliberation(current_setting('t.q')::uuid),
  '{"termines": 0, "en_cours": 0, "echecs": 0, "a_envoyer": 0, "cout_usd": 0}'::jsonb, 'sans audit : des zéros');
select throws_ok($$select public.reserver_envoi(current_setting('t.p')::uuid)$$, '42501', null, 'authenticated n''appelle pas reserver_envoi');
reset role;

-- reserver_envoi et fins_a_prevenir, rôle de service.
set local role service_role;
select is(public.reserver_envoi(current_setting('t.p')::uuid), null, 'en délibération : rien à réserver');
select is_empty($$select * from public.fins_a_prevenir()$$, 'aucune campagne prete : rien à prévenir');
reset role;
update public.campagne set statut = 'prete' where slug like 'suivi%';
set local role service_role;
select set_eq($$select * from public.fins_a_prevenir()$$,
  format('values (%L::uuid), (%L::uuid)', current_setting('t.p'), current_setting('t.q')), 'prete non prévenues : listées');
select is(public.reserver_envoi(current_setting('t.p')::uuid),
  jsonb_build_object('slug', 'suivip', 'titre', 'Titre suivip', 'email', 'b1@example.org'),
  'prete : la réservation rend slug, titre et adresse du Boss');
select is(public.reserver_envoi(current_setting('t.p')::uuid), null, 'second constat : rien, la marque est posée');
select set_eq($$select * from public.fins_a_prevenir()$$, format('values (%L::uuid)', current_setting('t.q')), 'P n''est plus à prévenir');
reset role;
select isnt((select fin_prevenue_le from public.campagne where slug = 'suivip'), null, 'fin_prevenue_le posée');
-- Q bloquée : ni listée ni réservée, la marque reste nulle.
update public.campagne set bloquee_le = now(), motif_blocage = 'Motif' where slug = 'suiviq';
set local role service_role;
select is_empty($$select * from public.fins_a_prevenir()$$, 'campagne bloquée : pas listée');
select is(public.reserver_envoi(current_setting('t.q')::uuid), null, 'campagne bloquée : rien à réserver');
reset role;
select is((select fin_prevenue_le from public.campagne where slug = 'suiviq'), null, 'Q pas encore prévenue');

select * from finish();
rollback;
