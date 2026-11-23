-- Inscription, quota, désinscription. Campagne seed-ouverte (…02), en inscriptions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

set local role authenticated;

-- Comptes non autorisés ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Le compte n''est pas autorisé à s''inscrire.', 'compte vérifié : inscription refusée');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Le compte n''est pas autorisé à s''inscrire.', 'compte en liste d''attente : inscription refusée');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Le compte n''est pas autorisé à s''inscrire.', 'compte refusé : inscription refusée');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a4","role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Le compte n''est pas autorisé à s''inscrire.', 'compte fermé : inscription refusée');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a5","role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Le compte n''est pas autorisé à s''inscrire.', 'e-mail à vérifier : inscription refusée');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Le compte n''est pas autorisé à s''inscrire.', 'l''organisateur ne concourt pas');
set local request.jwt.claims = '{"sub":"99999999-0000-4000-8000-000000000000","role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Le compte n''est pas autorisé à s''inscrire.', 'identité sans compte : inscription refusée');
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  '42501', 'Connecte-toi pour t''inscrire.', 'sans identité : inscription refusée');

-- Campagnes non ouvertes --------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Les inscriptions ne sont pas ouvertes pour cette campagne.', 'brouillon : inscription refusée');
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Les inscriptions ne sont pas ouvertes pour cette campagne.', 'délibération : inscription refusée');

-- Inscription normale -----------------------------------------------------------------------
select lives_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$, 'A s''inscrit');
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Ce compte est déjà inscrit à cette campagne.', 'A ne s''inscrit pas deux fois');
select is((select count(*) from public.participation where campagne_id = '20000000-0000-4000-8000-000000000002'),
  1::bigint, 'A voit sa participation');

-- Quota : une seule place restante -------------------------------------------------------------
reset role;
update public.campagne set max_participants = 2 where slug = 'seed-ouverte';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select lives_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$, 'B prend la dernière place');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Il n''y a plus de place dans cette campagne.', 'C ne prend pas une place qui n''existe plus');

-- L'organisateur ajoute deux candidats au-delà du quota, pas trois ---------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.ajouter_participant('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000c')$$,
  'l''organisateur ajoute C au-delà du quota');
select lives_ok($$select public.ajouter_participant('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000d')$$,
  'l''organisateur ajoute D au-delà du quota');
select throws_ok($$select public.ajouter_participant('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000e')$$,
  'P0001', 'Il n''y a plus de place dans cette campagne.', 'l''organisateur n''ajoute pas un troisième');
select throws_ok($$select public.ajouter_participant('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-0000000000a1')$$,
  'P0001', 'Le compte n''est pas autorisé à s''inscrire.', 'l''organisateur n''ajoute pas un compte non autorisé');
select is((select count(*) from public.participation where campagne_id = '20000000-0000-4000-8000-000000000002'),
  4::bigint, 'quatre inscrits : le quota de deux et deux au-delà');

-- Désinscription -------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok($$select public.se_desinscrire('20000000-0000-4000-8000-000000000002')$$, 'A se désinscrit');
select throws_ok($$select public.se_desinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', null, 'A ne se désinscrit pas deux fois');
select throws_ok($$select public.se_desinscrire('20000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Désinscription impossible : tu n''es pas inscrit, ou la délibération a commencé.',
  'désinscription impossible en délibération');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok($$select public.se_desinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', null, 'E, jamais inscrite, ne se désinscrit pas');
reset role;
select is((select count(*) from public.participation
           where campagne_id = '20000000-0000-4000-8000-000000000002' and etat = 'inscrit'),
  3::bigint, 'la participation d''A est retirée');

-- Réinscription après retrait, quand il reste de la place ---------------------------------------
update public.campagne set max_participants = 5 where slug = 'seed-ouverte';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$, 'A se réinscrit');
reset role;
select is((select etat::text || coalesce(retire_le::text, '-') from public.participation
           where campagne_id = '20000000-0000-4000-8000-000000000002' and compte_id = '10000000-0000-4000-8000-00000000000a'),
  'inscrit-', 'la participation est de nouveau active, sans date de retrait');
select is((select count(*) from public.participation
           where campagne_id = '20000000-0000-4000-8000-000000000002' and compte_id = '10000000-0000-4000-8000-00000000000a'),
  1::bigint, 'toujours une seule ligne pour A');

-- Plus de retrait une fois la délibération commencée ---------------------------------------------
update public.campagne set statut = 'depot' where slug = 'seed-ouverte';
update public.campagne set statut = 'deliberation' where slug = 'seed-ouverte';
set local role authenticated;
select throws_ok($$select public.se_desinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', null, 'A ne se retire plus quand la campagne est en délibération');
select throws_ok($$select public.sinscrire('20000000-0000-4000-8000-000000000002')$$,
  'P0001', null, 'plus d''inscription non plus');

select * from finish();
rollback;
