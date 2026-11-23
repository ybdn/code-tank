-- Accès anonyme et inventaire des droits. Les données viennent de seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Inventaire (superutilisateur) : RLS partout, et aucun privilège sans politique.
select is_empty(
  $$select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity$$,
  'RLS activée sur toutes les tables');
select is_empty(
  $$select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and (has_any_column_privilege('anon', c.oid, 'select,insert,update,references')
        or has_any_column_privilege('authenticated', c.oid, 'select,insert,update,references'))
      and not exists (select 1 from pg_policy where polrelid = c.oid)$$,
  'aucune table accordée sans politique');
select is_empty(
  $$select proname from pg_proc where pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', oid, 'execute')$$,
  'anon n''exécute aucune fonction');
select is(
  (select array_agg(proname::text order by proname) from pg_proc
   where pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', oid, 'execute')),
  array['ajouter_participant','changer_statut_campagne','decider_compte','demasquer_replique','enregistrer_decision',
        'est_organisateur','masquer_replique','retirer_depot','se_desinscrire','sinscrire','verrouiller_vote'],
  'authenticated exécute exactement les onze fonctions prévues');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok('select 1 from public.compte', '42501', null, 'anon ne lit pas compte');
select throws_ok('select 1 from public.reglage', '42501', null, 'anon ne lit pas reglage');
select throws_ok('select 1 from public.participation', '42501', null, 'anon ne lit pas participation');
select throws_ok('select 1 from public.depot', '42501', null, 'anon ne lit pas depot');
select throws_ok('select 1 from public.audit', '42501', null, 'anon ne lit pas audit');
select throws_ok('select 1 from public.vote_boss', '42501', null, 'anon ne lit pas vote_boss');
select throws_ok('select 1 from public.decision', '42501', null, 'anon ne lit pas decision');
select throws_ok('select 1 from public.mon_depot', '42501', null, 'anon ne lit pas mon_depot');
select throws_ok('select 1 from public.rapport', '42501', null, 'anon ne lit pas rapport');
select throws_ok('select 1 from public.contact_reutilisation_lisible', '42501', null, 'anon ne lit pas contact_reutilisation_lisible');

select is(
  (select array_agg(slug order by slug) from public.campagne),
  array['seed-deliberation', 'seed-ouverte', 'seed-publiee'],
  'anon lit les campagnes ouvertes, pas le brouillon');
select throws_ok(
  $$insert into public.campagne (slug, titre, theme, brief, criteres, ouverture_inscriptions, cloture_depot, date_resultats, max_participants)
    values ('x', 'x', 'x', 'x', '[]', now(), now() + '1 day', now() + '2 days', 1)$$,
  '42501', null, 'anon ne crée pas de campagne');
select throws_ok(
  $$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'anon ne peut pas appeler sinscrire');

select is(
  (select count(*) from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004'),
  6::bigint, 'anon lit le classement de la campagne publiée');
select is_empty(
  $$select 1 from public.classement where campagne_id <> '20000000-0000-4000-8000-000000000004'$$,
  'anon ne voit rien du classement des campagnes non publiées');
select columns_are('public', 'classement',
  array['campagne_id', 'pseudo', 'score_claude', 'note_boss', 'score_final', 'justification',
    'notes', 'disqualifie', 'justification_departage', 'rang'],
  'le classement n''expose ni vrai nom ni identifiant de compte');

-- Une campagne publiée repassée en délibération (impossible) n'est pas testable ; on vérifie
-- donc qu'une campagne prête reste invisible : seed-deliberation avancée en « prête ».
reset role;
update public.campagne set statut = 'prete' where slug = 'seed-deliberation';
set local role anon;
select is_empty(
  $$select 1 from public.classement where campagne_id = '20000000-0000-4000-8000-000000000003'$$,
  'rien du classement d''une campagne prête');
select is(
  (select count(*) from public.campagne where slug = 'seed-brouillon'), 0::bigint,
  'le brouillon reste invisible');

select * from finish();
rollback;
