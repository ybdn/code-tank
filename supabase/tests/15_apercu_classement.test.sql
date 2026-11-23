-- Aperçu du classement (organisateur, avant publication) : apercu_classement et la vue interne classement_calcul.
-- seed-deliberation (…03) : alice (3a) a un vote brouillon, bob (3b) n'a pas de vote. seed-resultats (…05) : publiée.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Personne d'autre que les propriétaires ne lit le calcul : il couvre les campagnes non publiées.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select 1 from public.classement_calcul$$, '42501', null, 'anon ne lit pas classement_calcul');
select throws_ok($$select 1 from public.apercu_classement('20000000-0000-4000-8000-000000000003')$$, '42501', null,
  'anon ne peut pas appeler apercu_classement');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok($$select 1 from public.classement_calcul$$, '42501', null, 'un candidat ne lit pas classement_calcul');
select throws_ok($$select 1 from public.apercu_classement('20000000-0000-4000-8000-000000000003')$$, '42501',
  'Réservé à l''organisateur.', 'un candidat ne peut pas lire l''aperçu');
select is_empty($$select 1 from public.classement where campagne_id = '20000000-0000-4000-8000-000000000003'$$,
  'le classement public ne montre toujours rien d''une campagne en délibération');

-- Organisateur, campagne en délibération.
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.apercu_classement('20000000-0000-4000-8000-000000000003')), 2::bigint,
  'une ligne par participation inscrite avec dépôt');
select is((select bool_and(not vote_verrouille and score_claude is null and notes is null and rang is null)
           from public.apercu_classement('20000000-0000-4000-8000-000000000003')),
  true, 'vote à l''aveugle : sans vote verrouillé, ni score Claude, ni notes, ni rang');

reset role;
update public.vote_boss set verrouille_le = now() where participation_id = '30000000-0000-4000-8000-00000000003a';
set local role authenticated;
select is((select round(score_claude) || ':' || note_boss || ':' || round(score_final, 1) || ':' || rang
           from public.apercu_classement('20000000-0000-4000-8000-000000000003') where pseudo = 'seed_alice'),
  '60:5:56.7:1', 'vote verrouillé : score Claude 60, Boss 5, score final 56,7, premier');
select is((select notes ->> 'outillage' from public.apercu_classement('20000000-0000-4000-8000-000000000003') where pseudo = 'seed_alice'),
  '6', 'les notes par critère apparaissent, outillage compris');
select is((select score_claude is null and rang is null
           from public.apercu_classement('20000000-0000-4000-8000-000000000003') where pseudo = 'seed_bob'),
  true, 'le vote de bob n''est pas verrouillé : son score reste caché');
select is_empty($$select 1 from public.classement where campagne_id = '20000000-0000-4000-8000-000000000003'$$,
  'l''aperçu ne publie rien');

-- Campagne publiée : l'aperçu donne exactement le classement public.
select is_empty($$
  (select pseudo, rang, score_claude, note_boss, score_final, notes, disqualifie, justification, justification_departage
   from public.apercu_classement('20000000-0000-4000-8000-000000000005'))
  except
  (select pseudo, rang, score_claude, note_boss, score_final, notes, disqualifie, justification, justification_departage
   from public.classement where campagne_id = '20000000-0000-4000-8000-000000000005')
$$, 'campagne publiée : l''aperçu ne diffère pas du classement public');
select is((select count(*) from public.apercu_classement('20000000-0000-4000-8000-000000000005')), 6::bigint,
  'et a autant de lignes');
select is((select string_agg(pseudo || ':' || coalesce(rang::text, '-'), ', ' order by rang nulls last, pseudo)
           from public.apercu_classement('20000000-0000-4000-8000-000000000005')),
  'seed_ada:1, seed_margaret:2, seed_alan:3, seed_grace:4, seed_edsger:5, seed_linus:-',
  'départage et disqualification : même rang que le classement public');

select * from finish();
rollback;
