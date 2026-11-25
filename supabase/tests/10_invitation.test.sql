-- Invitation (story 2.4) : jeton_invitation, lire_invitation, regenerer_invitation, sinscrire avec jeton, accès des inscrits
-- par campagne_phase, par rôle : visiteur, comptes actifs (A1 inscrit qui reste, A2 inscrit puis retiré, A3 sans lien), en
-- attente (E), suspendu (S), Boss joueur d'une invitation (B1), Boss d'une publique (B2), Boss de campagnes invisibles (B3 à
-- B5), rôle de service. Identité simulée par le rôle et request.jwt.claims. Phase d'inscription : dates relatives à now().
begin;
create extension if not exists pgtap with schema extensions;
select plan(70);

insert into auth.users (id, email)
select ('a1000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org'
from unnest(array['a1', 'a2', 'a3', 'e1', 'e2', 'b1', 'b2', 'b3', 'b4', 'b5']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('a1000000-0000-4000-8000-0000000000' || h)::uuid, 'a1' || h, 'invite_' || h, now(), '2026-11-25', now(),
  case h when 'e1' then 'en_attente' when 'e2' then 'suspendu' else 'actif' end
from unnest(array['a1', 'a2', 'a3', 'e1', 'e2', 'b1', 'b2', 'b3', 'b4', 'b5']) h;

-- Campagnes invisibles, posées en SQL avec leur jeton : bloquée (B3), brouillon (B4), expirée (B5).
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats, jeton_invitation)
select s, ('a1000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], 'invitation', 'juge', 2,
  now() - interval '1 day', now() + interval '10 days', now() + interval '20 days', repeat(j, 64)
from (values ('bloquee', 'b3', 'b'), ('brouillon', 'b4', 'c'), ('expiree', 'b5', 'd')) v(s, b, j);
update public.campagne set statut = 'ouverte' where slug = 'bloquee';
update public.campagne set bloquee_le = now(), motif_blocage = 'Essai' where slug = 'bloquee';
update public.campagne set statut = 'expiree' where slug = 'expiree';
select set_config('t.' || slug, id::text, true) from public.campagne;

-- Schéma et privilèges ---------------------------------------------------------------------------------
select col_is_unique('public', 'campagne', 'jeton_invitation', 'jeton_invitation unique');
select hasnt_column('public', 'campagne_phase', 'jeton_invitation', 'campagne_phase ne porte pas le jeton');
select function_returns('public', 'lire_invitation', array['text'], 'setof campagne_phase', 'lire_invitation rend les colonnes de campagne_phase, sans jeton');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats) values ('sans-jeton', 'a1000000-0000-4000-8000-0000000000a3', 'T', 'T', 'B',
  array['Go'], 'invitation', 'juge', 2, now(), now() + interval '1 day', now() + interval '2 days')$$, '23514', null,
  'invitation sans jeton : refusée par la table');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats, jeton_invitation) values ('pub-jeton', 'a1000000-0000-4000-8000-0000000000a3', 'T', 'T', 'B',
  array['Go'], 'publique', 'juge', 2, now(), now() + interval '1 day', now() + interval '2 days', repeat('e', 64))$$, '23514', null,
  'publique avec jeton : refusée par la table');
select throws_ok($$insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats, jeton_invitation) values ('jeton-court', 'a1000000-0000-4000-8000-0000000000a3', 'T', 'T', 'B',
  array['Go'], 'invitation', 'juge', 2, now(), now() + interval '1 day', now() + interval '2 days', 'abc')$$, '23514', null,
  'jeton hors forme : refusé par la table');
select is_empty($$
  select f from unnest(array['public.lire_invitation(text)', 'public.regenerer_invitation(uuid)']) f
  where not has_function_privilege('authenticated', f, 'execute')
$$, 'authenticated exécute lire_invitation et regenerer_invitation');
select is_empty($$
  select r, f from unnest(array['public', 'anon', 'service_role']) r, unnest(array['public.lire_invitation(text)', 'public.regenerer_invitation(uuid)']) f
  where has_function_privilege(r, f, 'execute')
$$, 'ni public, ni anon, ni le rôle de service n''exécutent lire_invitation ni regenerer_invitation');
select is_empty($$
  select r from unnest(array['anon', 'authenticated', 'service_role']) r
  where has_table_privilege(r, 'public.campagne_calculee', 'select,insert,update,delete,truncate,references,trigger')
$$, 'campagne_calculee (boss_id, jeton) : aucun droit client, rôle de service compris');
select is((select reloptions from pg_class where oid = 'public.campagne_calculee'::regclass), array['security_invoker=false'],
  'campagne_calculee : security_invoker = false');
select ok(pg_get_functiondef('public.regenerer_invitation(uuid)'::regprocedure) ~ 'for update', 'regenerer_invitation verrouille la ligne campagne');

-- Boss B1 : création sur invitation, jeton posé, lu par lui seul ------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select lives_ok($$select set_config('t.inv_slug', public.creer_campagne('Entre amis', 'Thème', 'Brief', array['Go'], 'invitation', 'joueur', 4,
  now() - interval '1 day', now() + interval '10 days', now() + interval '20 days'), true)$$, 'B1 crée une campagne sur invitation');
select set_config('t.inv', (select id::text from public.campagne where slug = current_setting('t.inv_slug')), true);
select lives_ok($$select public.ouvrir_campagne(current_setting('t.inv')::uuid)$$, 'B1 l''ouvre');
select matches((select jeton_invitation from public.campagne where id = current_setting('t.inv')::uuid), '^[0-9a-f]{64}$',
  'le Boss lit son jeton : 64 caractères hexadécimaux');
select set_config('t.jeton', (select jeton_invitation from public.campagne where id = current_setting('t.inv')::uuid), true);
select results_eq($$select slug from public.campagne_phase where id = current_setting('t.inv')::uuid$$, array[current_setting('t.inv_slug')],
  'le Boss voit sa campagne sur invitation');

-- Boss B2 : publique sans jeton ; passage sur invitation et retour ---------------------------------------------
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
select set_config('t.pub_slug', public.creer_campagne('Publique', 'Thème', 'Brief', array['Go'],
  'publique', 'juge', 2, now() - interval '1 day', now() + interval '10 days', now() + interval '20 days'), true);
select set_config('t.pub', (select id::text from public.campagne where slug = current_setting('t.pub_slug')), true);
select is((select jeton_invitation from public.campagne where id = current_setting('t.pub')::uuid), null, 'campagne publique créée sans jeton');
select throws_ok($$select public.regenerer_invitation(current_setting('t.pub')::uuid)$$, 'P0001', 'Seule une campagne sur invitation a un lien.',
  'publique : pas de lien à régénérer (409)');
select lives_ok($$select public.modifier_campagne(id, titre, theme, brief, langages, 'invitation', role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats) from public.campagne where id = current_setting('t.pub')::uuid$$, 'B2 passe sur invitation');
select matches((select jeton_invitation from public.campagne where id = current_setting('t.pub')::uuid), '^[0-9a-f]{64}$', 'passage sur invitation : jeton posé');
select set_config('t.jeton_pub', (select jeton_invitation from public.campagne where id = current_setting('t.pub')::uuid), true);
select lives_ok($$select public.modifier_campagne(id, 'Autre titre', theme, brief, langages, 'invitation', role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats) from public.campagne where id = current_setting('t.pub')::uuid$$, 'B2 modifie sans changer la visibilité');
select is((select jeton_invitation from public.campagne where id = current_setting('t.pub')::uuid), current_setting('t.jeton_pub'),
  'visibilité inchangée : même jeton');
select lives_ok($$select public.modifier_campagne(id, titre, theme, brief, langages, 'publique', role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats) from public.campagne where id = current_setting('t.pub')::uuid$$, 'B2 repasse en publique');
select is((select jeton_invitation from public.campagne where id = current_setting('t.pub')::uuid), null, 'retour en publique : jeton retiré');
select is_empty($$select 1 from public.campagne where jeton_invitation = current_setting('t.jeton')$$, 'B2 ne lit pas le jeton de B1 (RLS)');

-- Visiteur et rôle de service --------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$select * from public.lire_invitation(current_setting('t.jeton'))$$, '42501', null, 'le visiteur n''appelle pas lire_invitation');
select throws_ok($$select public.regenerer_invitation(current_setting('t.inv')::uuid)$$, '42501', null, 'le visiteur ne régénère pas');
select throws_ok($$select 1 from public.campagne_calculee$$, '42501', null, 'le visiteur ne lit pas campagne_calculee');
select is_empty($$select 1 from public.campagne_phase where id = current_setting('t.inv')::uuid$$, 'visiteur : la campagne sur invitation est invisible');
reset role;
set local role service_role;
select throws_ok($$select * from public.lire_invitation(current_setting('t.jeton'))$$, '42501', null, 'le rôle de service n''appelle pas lire_invitation');
select throws_ok($$select public.regenerer_invitation(current_setting('t.inv')::uuid)$$, '42501', null, 'le rôle de service ne régénère pas');
select throws_ok($$select 1 from public.campagne_calculee$$, '42501', null, 'le rôle de service ne lit pas campagne_calculee');
reset role;

-- Compte actif sans lien (A3), puis avec le lien ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select is_empty($$select 1 from public.campagne_phase where id = current_setting('t.inv')::uuid$$, 'compte actif sans lien : invisible dans campagne_phase');
select is_empty($$select 1 from public.campagne where id = current_setting('t.inv')::uuid$$, 'compte actif : ne lit pas la ligne ni son jeton (RLS)');
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true)$$, 'CT404', 'Campagne introuvable.', 'sans jeton : introuvable');
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true, repeat('0', 64))$$, 'CT404', 'Campagne introuvable.', 'mauvais jeton : introuvable');
select throws_ok($$select public.se_desinscrire(current_setting('t.inv')::uuid)$$, 'CT404', 'Campagne introuvable.', 'non inscrit : désinscription introuvable');
select throws_ok($$select * from public.lire_invitation(repeat('0', 64))$$, 'CT404', 'Campagne introuvable.', 'jeton inconnu : introuvable');
select throws_ok($$select * from public.lire_invitation(upper(current_setting('t.jeton')))$$, 'CT404', 'Campagne introuvable.', 'jeton en majuscules (hors forme) : introuvable');
select throws_ok($$select * from public.lire_invitation('')$$, 'CT404', 'Campagne introuvable.', 'jeton vide : introuvable');
select throws_ok($$select * from public.lire_invitation(null)$$, 'CT404', 'Campagne introuvable.', 'jeton nul : introuvable');
select throws_ok($$select * from public.lire_invitation(repeat('b', 64))$$, 'CT404', 'Campagne introuvable.', 'campagne bloquée : introuvable');
select throws_ok($$select * from public.lire_invitation(repeat('c', 64))$$, 'CT404', 'Campagne introuvable.', 'brouillon : introuvable');
select throws_ok($$select * from public.lire_invitation(repeat('d', 64))$$, 'CT404', 'Campagne introuvable.', 'campagne expirée : introuvable');
select results_eq($$select slug, phase, places_restantes, boss_pseudo from public.lire_invitation(current_setting('t.jeton'))$$,
  $$values (current_setting('t.inv_slug'), 'inscriptions', 4, 'invite_b1')$$, 'lien valide : la campagne, sa phase, ses places, son Boss');

-- Inscriptions par le lien : A1, A2 ; refus des comptes non actifs --------------------------------------------
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is((select count(*) from public.lire_invitation(current_setting('t.jeton'))), 1::bigint, 'compte en attente : lit la campagne du lien');
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true, current_setting('t.jeton'))$$, 'P0001', 'Ton compte n''est pas actif.',
  'compte en attente : ne s''inscrit pas');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000e2","role":"authenticated"}';
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true, current_setting('t.jeton'))$$, 'P0001', 'Ton compte n''est pas actif.',
  'compte suspendu : ne s''inscrit pas');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, false, current_setting('t.jeton'))$$, 'P0001', 'Coche la case : ton code sera envoyé à Anthropic.',
  'avec le lien, mêmes règles qu''en 2.3 : case à cocher');
select lives_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true, current_setting('t.jeton'))$$, 'A1 s''inscrit avec le lien');
select results_eq($$select slug from public.campagne_phase where id = current_setting('t.inv')::uuid$$, array[current_setting('t.inv_slug')],
  'A1, inscrit : voit la campagne dans campagne_phase, sans le lien');
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true)$$, 'P0001', 'Tu es déjà inscrit.', 'A1 inscrit, sans jeton : déjà inscrit');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select lives_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true, current_setting('t.jeton'))$$, 'A2 s''inscrit avec le lien');
select lives_ok($$select public.se_desinscrire(current_setting('t.inv')::uuid)$$, 'A2, inscrit sur invitation, se désinscrit');
select is_empty($$select 1 from public.campagne_phase where id = current_setting('t.inv')::uuid$$, 'A2, retiré : ne voit plus la campagne');
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true)$$, 'CT404', 'Campagne introuvable.', 'A2, retiré, sans jeton : introuvable');
select throws_ok($$select public.se_desinscrire(current_setting('t.inv')::uuid)$$, 'CT404', 'Campagne introuvable.', 'A2, retiré : désinscription introuvable');

-- Le Boss joueur s'inscrit à sa campagne sans jeton (il le connaît) ---------------------------------------------
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select lives_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true)$$, 'B1, Boss joueur, s''inscrit sans jeton');

-- Régénération -------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.regenerer_invitation(current_setting('t.inv')::uuid)$$, 'CT404', 'Campagne introuvable.', 'un inscrit ne régénère pas : introuvable');
select throws_ok($$select public.regenerer_invitation(gen_random_uuid())$$, 'CT404', 'Campagne introuvable.', 'campagne absente : introuvable');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000b3","role":"authenticated"}';
select throws_ok($$select public.regenerer_invitation(current_setting('t.bloquee')::uuid)$$, 'P0001', 'Cette campagne est bloquée ou échue : son lien ne change plus.',
  'campagne bloquée : pas de régénération');
reset role;
update public.compte set etat = 'suspendu' where id = 'a1000000-0000-4000-8000-0000000000b1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.regenerer_invitation(current_setting('t.inv')::uuid)$$, 'P0001', 'Ton compte n''est pas actif.', 'Boss suspendu : pas de régénération');
reset role;
update public.compte set etat = 'actif' where id = 'a1000000-0000-4000-8000-0000000000b1';
set local role authenticated;
select matches(public.regenerer_invitation(current_setting('t.inv')::uuid), '^[0-9a-f]{64}$', 'B1 régénère : nouveau jeton rendu');
select isnt((select jeton_invitation from public.campagne where id = current_setting('t.inv')::uuid), current_setting('t.jeton'), 'le jeton a changé');
select set_config('t.nouveau', (select jeton_invitation from public.campagne where id = current_setting('t.inv')::uuid), true);
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select * from public.lire_invitation(current_setting('t.jeton'))$$, 'CT404', 'Campagne introuvable.', 'ancien lien : introuvable');
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true, current_setting('t.jeton'))$$, 'CT404', 'Campagne introuvable.',
  'ancien jeton : aucune inscription');
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true, current_setting('t.jeton_pub'))$$, 'CT404', 'Campagne introuvable.',
  'jeton d''une autre campagne, retiré depuis : aucune inscription');
select is((select count(*) from public.lire_invitation(current_setting('t.nouveau'))), 1::bigint, 'nouveau lien : la campagne');
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select results_eq($$select slug, places_restantes from public.campagne_phase where id = current_setting('t.inv')::uuid$$,
  $$values (current_setting('t.inv_slug'), 2)$$, 'A1, inscrit avant la régénération : garde son accès');
select lives_ok($$select public.se_desinscrire(current_setting('t.inv')::uuid)$$, 'A1 se désinscrit encore après la régénération');
reset role;
select is((select count(*) from public.participation where campagne_id = current_setting('t.inv')::uuid and etat = 'inscrit'), 1::bigint,
  'seul le Boss joueur reste inscrit');

select * from finish();
rollback;
