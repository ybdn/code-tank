-- Organisateur : comptes, plafond, vote à l'aveugle, audits, décisions, réglages.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

-- Plafond de comptes (le serveur écrit avec la clé de service, qui contourne la RLS) -------------
update public.reglage set plafond_comptes = (
  select count(*) from public.compte where role = 'candidat' and etat in ('verifie', 'autorise'));
update public.compte set etat = 'verifie' where pseudo = 'seed_gus';
select is((select etat::text from public.compte where pseudo = 'seed_gus'), 'liste_attente',
  'plafond atteint : un compte vérifié passe en liste d''attente');
update public.reglage set plafond_comptes = 1000;
select is((select etat::text from public.compte where pseudo = 'seed_gus'), 'liste_attente',
  'rien n''en sort automatiquement quand le plafond monte');
update public.compte set etat = 'verifie' where pseudo = 'seed_gus';
select is((select etat::text from public.compte where pseudo = 'seed_gus'), 'verifie',
  'sous le plafond : le compte vérifié reste vérifié');
update public.reglage set plafond_comptes = null;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select public.est_organisateur()), true, 'l''organisateur est reconnu');
select is((select vrai_nom from public.compte where id = '10000000-0000-4000-8000-00000000000a'),
  'Prénom Fictif seed_alice', 'l''organisateur lit le vrai nom d''un candidat');
select throws_ok($$update public.compte set etat = 'autorise' where id = '10000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'même l''organisateur n''écrit pas l''état directement');

-- Décision sur les comptes --------------------------------------------------------------------
select lives_ok($$select public.decider_compte('10000000-0000-4000-8000-0000000000a1', 'liste_attente')$$,
  'mettre un compte vérifié en liste d''attente');
select is((select etat::text from public.compte where id = '10000000-0000-4000-8000-0000000000a1'),
  'liste_attente', 'son état a changé');
select lives_ok($$select public.decider_compte('10000000-0000-4000-8000-0000000000a2', 'autorise')$$,
  'autoriser un compte de la liste d''attente');
select is((select etat::text from public.compte where id = '10000000-0000-4000-8000-0000000000a2'),
  'autorise', 'son état a changé');
select throws_ok($$select public.decider_compte('10000000-0000-4000-8000-00000000000a', 'refuse')$$,
  'P0001', null, 'un compte déjà autorisé n''est pas refusé');
select throws_ok($$select public.decider_compte('10000000-0000-4000-8000-0000000000a4', 'autorise')$$,
  'P0001', null, 'un compte fermé n''est pas autorisé');
select throws_ok($$select public.decider_compte('10000000-0000-4000-8000-0000000000a1', 'ferme')$$,
  'P0001', null, 'décider_compte ne ferme pas un compte');
select throws_ok($$select public.decider_compte('10000000-0000-4000-8000-000000000001', 'refuse')$$,
  'P0001', null, 'l''organisateur ne se décide pas lui-même');

-- Vote à l'aveugle ----------------------------------------------------------------------------
select is((select count(*) from public.audit
           where depot_id in (select id from public.depot where participation_id in
             ('30000000-0000-4000-8000-00000000003a', '30000000-0000-4000-8000-00000000003b'))),
  0::bigint, 'vote non verrouillé : aucune note Claude lisible');
select is((select count(*) from public.audit
           where depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a')),
  4::bigint, 'vote verrouillé : les notes sont lisibles');
select is((select count(*) from public.contact_reutilisation_lisible where participation_id = '30000000-0000-4000-8000-00000000003a'),
  0::bigint, 'vote non verrouillé : pas de case de réutilisation');
select is((select count(*) from public.contact_reutilisation_lisible where participation_id = '30000000-0000-4000-8000-00000000004a'),
  1::bigint, 'vote verrouillé : la case est lisible');
select throws_ok($$select contact_reutilisation from public.depot$$, '42501', null,
  'la case n''est pas lisible directement, même de l''organisateur');

select lives_ok($$update public.vote_boss set note = 7 where participation_id = '30000000-0000-4000-8000-00000000003a'$$,
  'un vote non verrouillé se modifie');
select is((select note from public.vote_boss where participation_id = '30000000-0000-4000-8000-00000000003a'),
  7, 'la modification est enregistrée');
select lives_ok($$insert into public.vote_boss (participation_id, note) values ('30000000-0000-4000-8000-00000000003b', 3)$$,
  'vote en délibération');
select throws_ok($$insert into public.vote_boss (participation_id, note) values ('30000000-0000-4000-8000-00000000004e', 3)$$,
  '42501', null, 'pas de vote sur une campagne publiée');
select throws_ok($$insert into public.vote_boss (participation_id, note, verrouille_le) values ('30000000-0000-4000-8000-00000000003b', 3, now())$$,
  '42501', null, 'le verrouillage ne s''écrit pas directement');
select throws_ok($$update public.vote_boss set verrouille_le = now() where participation_id = '30000000-0000-4000-8000-00000000003b'$$,
  '42501', null, 'ni par une mise à jour');

select lives_ok($$select public.verrouiller_vote('30000000-0000-4000-8000-00000000003a')$$, 'verrouiller le vote d''A');
select is((select count(*) from public.audit
           where depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-00000000003a')),
  4::bigint, 'après verrouillage : les notes d''A sont lisibles');
select is((select count(*) from public.audit
           where depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-00000000003b')),
  0::bigint, 'celles de B ne le sont pas : son vote n''est pas verrouillé');
select is((select count(*) from public.contact_reutilisation_lisible where participation_id = '30000000-0000-4000-8000-00000000003a'),
  1::bigint, 'la case d''A est lisible après verrouillage');
select throws_ok($$update public.vote_boss set note = 1 where participation_id = '30000000-0000-4000-8000-00000000003a'$$,
  'P0001', 'Le vote est verrouillé : il ne se modifie plus.', 'un vote verrouillé ne se modifie pas');
select throws_ok($$delete from public.vote_boss where participation_id = '30000000-0000-4000-8000-00000000003a'$$,
  '42501', null, 'ni ne se supprime');
select throws_ok($$select public.verrouiller_vote('30000000-0000-4000-8000-00000000003a')$$,
  'P0001', null, 'ni ne se verrouille deux fois');
select throws_ok($$select public.verrouiller_vote('30000000-0000-4000-8000-00000000004e')$$,
  'P0001', null, 'pas de verrouillage sans vote');

-- Audits : jamais de modification, mais masquage de la réplique ------------------------------------
select throws_ok($$update public.audit set resultat = '{}'$$, '42501', null, 'l''organisateur ne modifie pas une note d''audit');
select throws_ok($$delete from public.audit$$, '42501', null, 'ni ne supprime un audit');
select throws_ok($$insert into public.audit default values$$, '42501', null, 'ni n''en crée');
select lives_ok(
  $$select public.masquer_replique((select id from public.audit where jure = 'sudo'
    and depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a')))$$,
  'l''organisateur masque une réplique');
select throws_ok($$select public.masquer_replique(gen_random_uuid())$$, 'P0001', 'Audit introuvable.', 'audit inconnu');

-- Décisions -----------------------------------------------------------------------------------
select lives_ok($$select public.enregistrer_decision('30000000-0000-4000-8000-00000000004b', 'fermeture_compte', 'Fausse déclaration établie (fictif).')$$,
  'fermer un compte');
select throws_ok($$select public.enregistrer_decision('30000000-0000-4000-8000-00000000004b', 'fermeture_compte', 'Encore.')$$,
  '23505', null, 'une même décision ne s''enregistre pas deux fois');
select throws_ok($$select public.enregistrer_decision('30000000-0000-4000-8000-00000000004a', 'departage', '   ')$$,
  '23514', null, 'la justification est obligatoire');
select throws_ok($$select public.enregistrer_decision('30000000-0000-4000-8000-00000000004d', 'fermeture_compte', 'Compte inexistant.')$$,
  'P0001', 'Le compte de cette participation n''existe plus.', 'pas de fermeture d''un compte supprimé');
select is((select count(*) from public.decision where participation_id = '30000000-0000-4000-8000-00000000004d'),
  0::bigint, 'et rien n''est enregistré dans ce cas');
select is((select justification is null from public.classement where pseudo = 'seed_bob'), true,
  'la justification d''une fermeture de compte n''est jamais publique');

-- Réglages -------------------------------------------------------------------------------------
select lives_ok($$update public.reglage set plafond_depense_usd = 60$$, 'l''organisateur règle le plafond de dépense');
select throws_ok($$insert into public.reglage default values$$, '42501', null, 'la ligne de réglage est unique');
select throws_ok($$delete from public.reglage$$, '42501', null, 'et ne se supprime pas');

reset role;
select is((select etat::text from public.compte where pseudo = 'seed_bob'), 'ferme', 'le compte fermé est bien fermé');
select is((select replique_masquee from public.audit where jure = 'sudo'
           and depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a')),
  true, 'la réplique est masquée');
select is((select (resultat -> 'criteres' -> 0 ->> 'note') from public.audit where jure = 'sudo'
           and depot_id = (select id from public.depot where participation_id = '30000000-0000-4000-8000-00000000004a')),
  '8', 'sans toucher à la note');

select * from finish();
rollback;
