-- demasquer_replique : l'inverse de masquer_replique, mêmes contrôles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Audit de test : le sudo du dépôt de la participation 4a (seed-publiee).
create temp table cible as
  select id from public.audit
  where jure = 'sudo' and depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a');
grant select on cible to anon, authenticated;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.demasquer_replique((select id from cible))$$, '42501', null, 'anon ne démasque pas');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok($$select public.demasquer_replique((select id from cible))$$,
  '42501', 'Réservé à l''organisateur.', 'un candidat ne démasque pas');
select throws_ok($$select public.demasquer_replique(gen_random_uuid())$$,
  '42501', 'Réservé à l''organisateur.', 'ni un audit inconnu : la réserve passe avant');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.masquer_replique((select id from cible))$$, 'l''organisateur masque');
select is((select replique_masquee from public.audit where id = (select id from cible)), true, 'la réplique est masquée');
select lives_ok($$select public.demasquer_replique((select id from cible))$$, 'l''organisateur démasque');
select is((select replique_masquee from public.audit where id = (select id from cible)), false, 'la réplique est démasquée');
select throws_ok($$select public.demasquer_replique(gen_random_uuid())$$, 'P0001', 'Audit introuvable.', 'audit inconnu refusé');

select * from finish();
rollback;
