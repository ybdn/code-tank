-- Classement public et score (SPECS § 7). Campagne seed-publiee (…04), lue en anonyme.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Vote d'eve (40) rendu non verrouillé : le déclencheur de publication l'interdit désormais, la vue
-- reste pourtant défensive.
alter table public.vote_boss disable trigger vote_boss_fige;
update public.vote_boss set verrouille_le = null where participation_id = '30000000-0000-4000-8000-000000000040';
alter table public.vote_boss enable trigger vote_boss_fige;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is((select string_agg(pseudo || ':' || round(score_claude) || ':' || note_boss || ':' || round(score_final, 1), ', ' order by score_final desc)
           from public.classement where pseudo in ('seed_alice', 'seed_bob')),
  'seed_bob:70:9:76.7, seed_alice:80:4:66.7',
  'exemple du § 7 : A 80 et 4 du Boss font 66,7 ; B 70 et 9 font 76,7, B devant');
select is((select justification from public.classement where pseudo = 'seed_chloe'),
  'Tentative de manipulation du jury confirmée (donnée fictive).', 'le disqualifié figure avec sa justification publique');
select is((select count(*) from public.classement where pseudo = 'candidat supprimé'), 1::bigint,
  'un compte supprimé s''affiche « candidat supprimé »');
select is((select count(*) from public.classement where pseudo = 'seed_dan'), 0::bigint,
  'un inscrit sans dépôt ne figure pas au classement');
select is((select score_claude is null and score_final is null and note_boss = 7 from public.classement where pseudo = 'seed_frank'),
  true, 'audit manquant : pas de score, ni Claude ni final');
select is((select score_claude = 60 and note_boss is null and score_final is null from public.classement where pseudo = 'seed_eve'),
  true, 'vote du Boss non verrouillé : sa note n''apparaît pas, pas de score final');

reset role;
-- Un audit en échec : pas de score, jamais zéro.
update public.audit set statut = 'echec', resultat = null
where jure = 'lint' and depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a');
set local role anon;
select is((select score_claude is null and score_final is null from public.classement where pseudo = 'seed_alice'),
  true, 'audit en échec : pas de score');

reset role;
-- Le critère « outillage » vient de la note calculée par script, pas d'un audit.
update public.depot set note_outillage = 0 where participation_id = '30000000-0000-4000-8000-00000000004b';
set local role anon;
select is((select round(score_claude) from public.classement where pseudo = 'seed_bob'), 63::numeric,
  'la note d''outillage (poids 10) compte dans le score Claude');
reset role;
update public.depot set note_outillage = null where participation_id = '30000000-0000-4000-8000-00000000004b';
set local role anon;
select is((select score_claude is null from public.classement where pseudo = 'seed_bob'), true,
  'note d''outillage absente : pas de score');

reset role;
-- Un retrait sort du classement.
update public.participation set etat = 'retire', retire_le = now() where id = '30000000-0000-4000-8000-00000000004a';
set local role anon;
select is((select count(*) from public.classement where pseudo = 'seed_alice'), 0::bigint, 'un participant retiré ne figure pas au classement');

reset role;
-- Suppression réelle d'un compte : la ligne reste, sous « candidat supprimé », avec sa justification.
delete from auth.users where id = '10000000-0000-4000-8000-00000000000c';
set local role anon;
select is((select count(*) from public.classement where pseudo = 'seed_chloe'), 0::bigint, 'le pseudo du compte supprimé disparaît');
select is((select count(*) from public.classement where pseudo = 'candidat supprimé' and justification is not null), 1::bigint,
  'la ligne reste, avec la justification de la disqualification');

reset role;
-- Campagne archivée : le classement reste public.
update public.campagne set statut = 'archivee' where slug = 'seed-publiee';
set local role anon;
select is((select count(*) from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004'), 5::bigint,
  'le classement d''une campagne archivée reste lisible');

-- Candidat connecté : même vue, sans accès aux identités.
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is((select count(*) from public.classement where campagne_id = '20000000-0000-4000-8000-000000000004'), 5::bigint,
  'un candidat lit le même classement');
select is_empty($$select 1 from public.compte where id <> '10000000-0000-4000-8000-00000000000b'$$,
  'et ne lit toujours aucun autre compte');
select is_empty($$select 1 from public.classement where campagne_id = '20000000-0000-4000-8000-000000000003'$$,
  'rien d''une campagne en délibération');

select * from finish();
rollback;
