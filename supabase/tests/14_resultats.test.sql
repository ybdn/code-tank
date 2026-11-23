-- Pages de résultats (campagne seed-resultats, …05) : le classement lu en anonyme, l'entretien lu par son seul candidat.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select string_agg(pseudo, ', ' order by rang) from public.classement
           where campagne_id = '20000000-0000-4000-8000-000000000005' and rang is not null),
  'seed_ada, seed_margaret, seed_alan, seed_grace, seed_edsger',
  'le classement ordonne les cinq classés, le départage plaçant margaret devant alan à égalité de score');
select is((select justification_departage is not null from public.classement where pseudo = 'seed_margaret'), true,
  'le départage est public avec sa justification');
select is((select disqualifie and rang is null from public.classement where pseudo = 'seed_linus'), true,
  'le disqualifié n''a pas de rang');
select throws_ok('select 1 from public.rapport', '42501', null, 'anon ne lit pas les rapports');

-- Alan lit ses quatre audits, sans la réplique de Sudo, masquée ; Ada lit les siens, répliques comprises.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated", "sub":"10000000-0000-4000-8000-0000000000d5"}';
select is((select count(*) from public.rapport where campagne_id = '20000000-0000-4000-8000-000000000005'), 4::bigint,
  'alan lit ses quatre audits');
select is((select resultat ? 'replique' from public.rapport where jure = 'sudo'), false, 'la réplique masquée est absente de la vue');
select is((select count(*) from public.rapport where resultat ? 'replique'), 3::bigint, 'les trois autres répliques y sont');

set local request.jwt.claims = '{"role":"authenticated", "sub":"10000000-0000-4000-8000-0000000000d1"}';
select is((select count(*) from public.rapport where resultat ? 'replique'), 4::bigint, 'ada lit ses quatre répliques');
select is((select count(*) from public.rapport where depot_id in (
  select d.id from public.depot d join public.participation p on p.id = d.participation_id where p.compte_id <> '10000000-0000-4000-8000-0000000000d1')), 0::bigint,
  'ada ne lit aucun audit d''un autre');

-- Vote du Boss : ada lit la note et le commentaire du sien, pas alan ; rien tant que la campagne n'est pas publiée ou que le vote n'est pas verrouillé ; plus rien après la suppression du compte.
select is((select commentaire from public.mon_vote_boss), 'Commentaire fictif du Boss : un projet net, je le referais avec un test de plus.', 'ada lit le commentaire du Boss sur son dépôt');
select is((select note from public.mon_vote_boss), 8, 'et sa note');
set local request.jwt.claims = '{"role":"authenticated", "sub":"10000000-0000-4000-8000-0000000000d5"}';
select is((select count(*) from public.mon_vote_boss), 1::bigint, 'alan lit son vote, sans le commentaire d''ada');
select is((select commentaire from public.mon_vote_boss), null, 'dont le commentaire est vide');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select 1 from public.mon_vote_boss', '42501', null, 'anon ne lit pas mon_vote_boss');

-- Ada est le sujet : sans publication, ou sans verrou, sa note et son commentaire restent fermés.
reset role;
set local session_replication_role = replica;
update public.campagne set statut = 'prete' where slug = 'seed-resultats';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated", "sub":"10000000-0000-4000-8000-0000000000d1"}';
select is((select count(*) from public.mon_vote_boss), 0::bigint, 'rien tant que la campagne n''est pas publiée');
reset role;
set local session_replication_role = replica;
update public.campagne set statut = 'publiee' where slug = 'seed-resultats';
update public.vote_boss set verrouille_le = null where participation_id = '30000000-0000-4000-8000-00000000005a';
set local session_replication_role = origin;
set local role authenticated;
select is((select count(*) from public.mon_vote_boss), 0::bigint, 'rien tant que le vote n''est pas verrouillé');

select * from finish();
rollback;
