-- Candidat : alice (A) face à bob (B). Identité simulée par le rôle et request.jwt.claims.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';

-- Lecture ------------------------------------------------------------------------------------
select is((select count(*) from public.compte), 1::bigint, 'A ne voit que son propre compte');
select is((select vrai_nom from public.compte where id = '10000000-0000-4000-8000-00000000000a'),
  'Prénom Fictif seed_alice', 'A lit son vrai nom');
select is_empty(
  $$select vrai_nom, email_contact, motivation, depot_cite_url, github_donnees
    from public.compte where id = '10000000-0000-4000-8000-00000000000b'$$,
  'A ne lit ni vrai nom, ni e-mail, ni motivation, ni dépôt cité, ni données GitHub de B');
select is_empty($$select 1 from public.participation where compte_id = '10000000-0000-4000-8000-00000000000b'$$,
  'A ne voit pas la participation de B');
select is((select count(*) from public.participation), 2::bigint, 'A lit ses deux participations');
select is((select presentation from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a'),
  'Présentation fictive.', 'A lit son dépôt (campagne publiée)');
select is_empty(
  $$select 1 from public.depot where participation_id in
    ('30000000-0000-4000-8000-00000000004b', '30000000-0000-4000-8000-00000000003b')$$,
  'A ne lit le dépôt de B ni en campagne publiée ni en délibération');
select is_empty($$select 1 from public.depot where participation_id = '30000000-0000-4000-8000-00000000003a'$$,
  'A ne lit pas son propre dépôt pendant la délibération');
select throws_ok($$select contact_reutilisation from public.depot$$, '42501', null,
  'contact_reutilisation n''est pas lisible directement');
select is((select count(*) from public.contact_reutilisation_lisible), 2::bigint,
  'A lit la case de ses propres dépôts par la vue, et d''aucun autre');
select is((select count(*) from public.campagne where slug = 'seed-brouillon'), 0::bigint,
  'A ne voit pas le brouillon');

-- Rapport -----------------------------------------------------------------------------------
select is((select count(*) from public.audit), 0::bigint, 'A ne lit aucun audit directement');
select is((select count(*) from public.rapport), 4::bigint, 'A lit les quatre rapports de son dépôt publié, pas ceux de B');
select is((select count(distinct depot_id) from public.rapport), 1::bigint, 'ces rapports sont tous ceux de son dépôt');
select is_empty($$select 1 from public.rapport where campagne_id = '20000000-0000-4000-8000-000000000003'$$,
  'A ne lit pas son propre rapport avant publication');

reset role;
update public.audit set replique_masquee = true
where jure = 'sudo' and depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a');
update public.campagne set statut = 'prete' where slug = 'seed-deliberation';
set local role authenticated;
select is((select resultat ? 'replique' from public.rapport where jure = 'sudo'), false,
  'une réplique masquée n''est pas renvoyée au candidat');
select is((select resultat ? 'replique' from public.rapport where jure = 'pitch'), true,
  'les autres répliques le sont');
select is_empty($$select 1 from public.depot where participation_id = '30000000-0000-4000-8000-00000000003a'$$,
  'campagne prête : A ne lit toujours pas son dépôt');

-- Écriture de son profil ----------------------------------------------------------------------
select lives_ok($$update public.compte set motivation = 'Nouvelle motivation fictive.' where id = '10000000-0000-4000-8000-00000000000a'$$,
  'A modifie son profil');
select is((select motivation from public.compte where id = '10000000-0000-4000-8000-00000000000a'),
  'Nouvelle motivation fictive.', 'la modification est bien enregistrée');
select is_empty($$update public.compte set motivation = 'piraté' where id = '10000000-0000-4000-8000-00000000000b' returning 1$$,
  'A ne modifie pas le profil de B');
select throws_ok($$update public.compte set pseudo = 'SEED_BOB' where id = '10000000-0000-4000-8000-00000000000a'$$,
  '23505', null, 'le pseudo est unique, sans tenir compte de la casse');
select throws_ok($$update public.compte set pseudo = 'Candidat supprimé' where id = '10000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'le pseudo « candidat supprimé » est réservé');
select throws_ok($$update public.compte set depot_cite_url = 'javascript:alert(1)' where id = '10000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'le dépôt cité doit être une adresse https');
select lives_ok($$update public.compte set email_contact = 'alice.nouvelle@example.invalid' where id = '10000000-0000-4000-8000-00000000000a'$$,
  'A change son e-mail de contact');

reset role;
select is((select email_verifie_le is null from public.compte where id = '10000000-0000-4000-8000-00000000000a'), true,
  'l''e-mail modifié n''est plus vérifié');
select is((select motivation from public.compte where id = '10000000-0000-4000-8000-00000000000b'),
  'Motivation fictive de seed_bob.', 'le profil de B est intact');
set local role authenticated;

-- Colonnes interdites -------------------------------------------------------------------------
select throws_ok($$update public.compte set role = 'organisateur' where id = '10000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'A ne se donne pas le rôle organisateur');
select throws_ok($$update public.compte set etat = 'autorise' where id = '10000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'A ne modifie pas son état');
select throws_ok($$update public.compte set github_id = 'fictif-autre' where id = '10000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'A ne modifie pas github_id');
select throws_ok($$update public.compte set github_donnees = '{}' where id = '10000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'A ne modifie pas github_donnees');
select throws_ok($$update public.compte set etat_le = now() where id = '10000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'A ne modifie pas la date d''état');
select throws_ok($$insert into public.compte (id, github_id, vrai_nom, pseudo, email_contact, motivation, depot_cite_url, majeur_declare_le, charte_acceptee_le, version_charte, role)
  values (gen_random_uuid(), 'x', 'x', 'xx', 'x@x.x', 'x', 'https://x', now(), now(), now(), 'organisateur')$$,
  '42501', null, 'A ne crée aucun compte');

-- Tables réservées au serveur -----------------------------------------------------------------
select throws_ok($$insert into public.audit default values$$, '42501', null, 'A n''écrit pas dans audit');
select throws_ok($$insert into public.depot default values$$, '42501', null, 'A n''écrit pas dans depot');
select throws_ok($$update public.depot set note_outillage = 10$$, '42501', null, 'A ne modifie pas un dépôt');
select throws_ok($$insert into public.decision default values$$, '42501', null, 'A n''écrit pas dans decision');
select throws_ok(
  $$insert into public.vote_boss (participation_id, note) values ('30000000-0000-4000-8000-00000000004e', 10)$$,
  '42501', null, 'A n''écrit pas dans vote_boss');
select is_empty($$update public.vote_boss set note = 10 returning 1$$, 'A ne modifie aucun vote');
select is_empty($$update public.reglage set plafond_comptes = 1 returning 1$$, 'A ne modifie pas reglage');

select * from finish();
rollback;
