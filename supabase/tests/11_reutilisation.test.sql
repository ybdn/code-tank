-- regler_contact_reutilisation : le candidat règle sa case (depot et reception), rien d'autre, jamais celle d'un autre.
-- Alice (0a) a un dépôt à seed-publiee (…04, terminée) ; on lui ajoute une réception à seed-ouverte (…02) avec un dépôt.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.participation (id, campagne_id, compte_id) values
  ('30000000-0000-4000-8000-0000000000f1', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a');
insert into public.reception (participation_id, chemin_stockage, presentation, type_code, declaration_code_le, contact_reutilisation) values
  ('30000000-0000-4000-8000-0000000000f1', '2/f1/a.zip', 'Présentation d''Alice.', 'open_source', now(), false);

select is(has_function_privilege('anon', 'public.regler_contact_reutilisation(uuid,boolean)', 'execute'), false, 'anon n''exécute pas la fonction');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
-- Campagne publiée : dépôt seul, pas de réception ; la clôture est passée depuis longtemps.
select lives_ok($$select public.regler_contact_reutilisation('20000000-0000-4000-8000-000000000004', true)$$, 'Alice règle sa case sur une campagne terminée');
select is((select contact_reutilisation from public.mon_depot where participation_id = '30000000-0000-4000-8000-00000000004a'),
  true, 'le dépôt porte la nouvelle valeur');
select lives_ok($$select public.regler_contact_reutilisation('20000000-0000-4000-8000-000000000004', false)$$, 'et la retire');
select is((select contact_reutilisation from public.mon_depot where participation_id = '30000000-0000-4000-8000-00000000004a'), false, 'valeur retirée');
-- Campagne ouverte : réception seule.
select lives_ok($$select public.regler_contact_reutilisation('20000000-0000-4000-8000-000000000002', true)$$, 'Alice règle sa case sur une réception');
select is((select contact_reutilisation from public.ma_reception where participation_id = '30000000-0000-4000-8000-0000000000f1'), true, 'la réception porte la valeur');
select throws_ok($$select public.regler_contact_reutilisation('20000000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Tu n''as ni dépôt ni envoi dans cette campagne.', 'sans participation, rien');

-- Dan (0d) est inscrit à seed-publiee sans dépôt : il ne peut pas toucher la case d'Alice ni de Bob.
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000d","role":"authenticated"}';
select throws_ok($$select public.regler_contact_reutilisation('20000000-0000-4000-8000-000000000004', true)$$,
  'P0001', 'Tu n''as ni dépôt ni envoi dans cette campagne.', 'un autre candidat ne modifie pas la case d''Alice');
select throws_ok($$update public.depot set contact_reutilisation = true$$, '42501', null, 'et nul n''écrit depot directement');

reset role;
select is((select count(*) from public.depot where contact_reutilisation), 0::bigint, 'aucune case de dépôt n''a changé pour Dan');
select is((select presentation from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a'), 'Présentation fictive.',
  'la fonction ne touche aucune autre colonne');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.regler_contact_reutilisation('20000000-0000-4000-8000-000000000004', true)$$, '42501', null, 'anonyme refusé');

select * from finish();
rollback;
