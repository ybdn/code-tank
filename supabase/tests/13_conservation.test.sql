-- Conservation : date de publication, confirmation d'attente, dernière connexion, purge de debit, envois abandonnés.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Date de bob avant tout appel : la fin du fichier prouve qu'elle n'a pas bougé, quel que soit son âge.
create temp table bob_avant as select derniere_connexion_le from public.compte where pseudo = 'seed_bob';

-- publiee_le : renseignée par le passage à « publiee ».
select isnt((select publiee_le from public.campagne where slug = 'seed-publiee'), null, 'la campagne publiée du seed a sa date');
select is((select publiee_le from public.campagne where slug = 'seed-deliberation'), null, 'une campagne non publiée n''en a pas');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$update public.campagne set publiee_le = now()$$, '42501', null, 'même l''organisateur n''écrit pas publiee_le');
reset role;
select is(has_function_privilege('anon', 'public.noter_connexion()', 'execute'), false, 'anon n''exécute pas noter_connexion');

-- Liste d'attente : wendy (a2).
update public.compte set attente_demandee_le = now() - interval '5 days' where pseudo = 'seed_wendy';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select lives_ok($$select public.confirmer_attente()$$, 'wendy confirme qu''elle attend');
reset role;
select is((select attente_demandee_le from public.compte where pseudo = 'seed_wendy'), null, 'la demande est soldée');
select isnt((select confirme_attente_le from public.compte where pseudo = 'seed_wendy'), null, 'la confirmation est datée');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok($$select public.confirmer_attente()$$, 'P0001', 'Ton compte n''est pas en liste d''attente.', 'un compte autorisé ne confirme rien');
select throws_ok($$update public.compte set attente_demandee_le = null$$, '42501', null, 'nul n''écrit la colonne directement');
reset role;
update public.compte set attente_demandee_le = now() where pseudo = 'seed_wendy';
update public.compte set etat = 'autorise' where pseudo = 'seed_wendy';
select is((select attente_demandee_le from public.compte where pseudo = 'seed_wendy'), null, 'un changement d''état efface la demande');

-- Dernière connexion : alice (0a).
update public.compte set derniere_connexion_le = now() - interval '25 months', prevenu_inactivite_le = now() - interval '3 days' where pseudo = 'seed_alice';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok($$select public.noter_connexion()$$, 'alice note sa connexion');
reset role;
select cmp_ok((select derniere_connexion_le from public.compte where pseudo = 'seed_alice'), '>', now() - interval '1 minute', 'la date est à jour');
select is((select prevenu_inactivite_le from public.compte where pseudo = 'seed_alice'), null, 'l''avertissement est annulé');
update public.compte set derniere_connexion_le = now() - interval '2 hours' where pseudo = 'seed_alice';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok($$select public.noter_connexion()$$, 'deuxième appel');
reset role;
select cmp_ok((select derniere_connexion_le from public.compte where pseudo = 'seed_alice'), '<', now() - interval '1 hour', 'au plus une écriture par jour');
select is((select derniere_connexion_le from public.compte where pseudo = 'seed_bob'), (select derniere_connexion_le from bob_avant), 'les autres comptes ne bougent pas');

-- Purge de debit : bornée.
insert into public.debit (empreinte, action, le)
select repeat('d', 64), 'vieux', now() - interval '30 hours' from generate_series(1, 5);
insert into public.debit (empreinte, action) values (repeat('d', 64), 'recent');
set local role service_role;
select is((select public.purger_debit(3, 24)), 3, 'la purge respecte la borne');
select is((select public.purger_debit(3, 24)), 2, 'puis finit le travail');
select is((select public.purger_debit(3, 24)), 0, 'et ne fait plus rien');
reset role;
select is((select count(*) from public.debit where action = 'recent'), 1::bigint, 'une ligne récente reste');

-- Envois abandonnés : seul l'objet ancien et non référencé.
insert into storage.objects (bucket_id, name, created_at) values
  ('depots', 'x/y/vieux-libre.zip', now() - interval '25 hours'),
  ('depots', 'x/y/vieux-recu.zip', now() - interval '25 hours'),
  ('depots', 'x/y/recent.zip', now() - interval '1 hour');
insert into public.participation (id, campagne_id, compte_id) values
  ('30000000-0000-4000-8000-0000000000f1', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a');
insert into public.reception (participation_id, chemin_stockage, presentation, type_code, declaration_code_le)
values ('30000000-0000-4000-8000-0000000000f1', 'x/y/vieux-recu.zip', 'x', 'open_source', now());
select is(has_function_privilege('authenticated', 'public.objets_abandonnes(integer,integer)', 'execute'), false, 'authenticated n''exécute pas objets_abandonnes');
set local role service_role;
select is((select array_agg(n) from public.objets_abandonnes(10, 24) n), array['x/y/vieux-libre.zip'], 'seul l''objet ancien et non référencé est rendu');
reset role;

select * from finish();
rollback;
