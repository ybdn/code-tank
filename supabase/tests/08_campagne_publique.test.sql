-- Ouverture et lecture publique (story 2.2) : ouvrir_campagne et la vue campagne_phase, par rôle : visiteur, compte actif
-- sans campagne (O), Boss (B), Boss d'une autre campagne sur invitation (B2), Boss de campagnes invisibles (X, Y), rôle de
-- service. Identité simulée par le rôle et request.jwt.claims. Dates fixes en 2090, hors changement d'heure ; now()
-- seulement pour « passé » et pour les bornes exactes des phases.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, email) values
  ('80000000-0000-4000-8000-0000000000b1', 'b1@example.org'),
  ('80000000-0000-4000-8000-0000000000b2', 'b2@example.org'),
  ('80000000-0000-4000-8000-0000000000a1', 'a1@example.org'),
  ('80000000-0000-4000-8000-0000000000c1', 'c1@example.org'),
  ('80000000-0000-4000-8000-0000000000c2', 'c2@example.org'),
  ('80000000-0000-4000-8000-0000000000c3', 'c3@example.org'),
  ('80000000-0000-4000-8000-0000000000c4', 'c4@example.org'),
  ('80000000-0000-4000-8000-0000000000c5', 'c5@example.org'),
  ('80000000-0000-4000-8000-0000000000c6', 'c6@example.org');
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select id, '80' || right(id::text, 2), p, now(), '2026-11-25', now(), 'actif'
from (values
  ('80000000-0000-4000-8000-0000000000b1'::uuid, 'boss_b'), ('80000000-0000-4000-8000-0000000000b2'::uuid, 'boss_b2'),
  ('80000000-0000-4000-8000-0000000000a1'::uuid, 'autre_o'), ('80000000-0000-4000-8000-0000000000c1'::uuid, 'boss_x'),
  ('80000000-0000-4000-8000-0000000000c2'::uuid, 'boss_y'), ('80000000-0000-4000-8000-0000000000c3'::uuid, 'boss_z'),
  ('80000000-0000-4000-8000-0000000000c4'::uuid, 'boss_e'), ('80000000-0000-4000-8000-0000000000c5'::uuid, 'boss_f'),
  ('80000000-0000-4000-8000-0000000000c6'::uuid, 'boss_p')) v(id, p);

-- Une campagne par cas, posée en SQL (le déclencheur exige la naissance en brouillon). L'expirée de Y d'abord : une seule
-- campagne active par Boss.
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats) values
  ('expiree-y', '80000000-0000-4000-8000-0000000000c2', 'Expirée', 'Thème', 'Brief', array['Go'], 'publique', 'juge', 5,
    timestamptz '2090-06-01 09:00 Europe/Paris' + interval '1 day', timestamptz '2090-06-01 09:00 Europe/Paris' + interval '2 days',
    timestamptz '2090-06-01 09:00 Europe/Paris' + interval '3 days');
update public.campagne set statut = 'expiree' where slug = 'expiree-y';
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
select s, b::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], v, 'juge', 5, o, c, r
from (values
  ('pub-b', '80000000-0000-4000-8000-0000000000b1', 'publique'),
  ('inv-b2', '80000000-0000-4000-8000-0000000000b2', 'invitation'),
  ('brouillon-x', '80000000-0000-4000-8000-0000000000c1', 'publique'),
  ('bloquee-y', '80000000-0000-4000-8000-0000000000c2', 'publique'),
  ('bloque-z', '80000000-0000-4000-8000-0000000000c3', 'publique'),
  ('phase-p', '80000000-0000-4000-8000-0000000000c6', 'publique')) v(s, b, v),
  (select timestamptz '2090-06-01 09:00 Europe/Paris' + interval '1 day' o, timestamptz '2090-06-01 09:00 Europe/Paris' + interval '2 days' c,
    timestamptz '2090-06-01 09:00 Europe/Paris' + interval '3 days' r) d;
-- Échue (résultats passés) et clôture des dépôts tombant à l'instant même : now() pour « passé ».
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats) values
  ('echue-e', '80000000-0000-4000-8000-0000000000c4', 'Échue', 'Thème', 'Brief', array['Go'], 'publique', 'juge', 5,
    now() - interval '3 days', now() - interval '2 days', now() - interval '1 day'),
  ('cloture-f', '80000000-0000-4000-8000-0000000000c5', 'Clôture', 'Thème', 'Brief', array['Go'], 'publique', 'juge', 5,
    now() - interval '1 day', now(), now() + interval '1 day');
update public.campagne set statut = 'ouverte' where slug in ('inv-b2', 'bloquee-y', 'phase-p');
update public.campagne set bloquee_le = now(), motif_blocage = 'Essai' where slug in ('bloquee-y', 'bloque-z');
select set_config('t.' || replace(slug, '-', '_'), id::text, true) from public.campagne;

-- Privilèges et schéma ---------------------------------------------------------------------------
select columns_are('public', 'campagne_phase', array['id', 'slug', 'titre', 'theme', 'brief', 'langages', 'visibilite', 'role_boss',
  'max_participants', 'ouverture_inscriptions', 'cloture_depot', 'date_resultats', 'statut', 'phase', 'boss_pseudo'],
  'campagne_phase : colonnes d''affichage, ni boss_id ni motif_blocage ni bloquee_le');
select is((select reloptions from pg_class where oid = 'public.campagne_phase'::regclass), array['security_invoker=false'],
  'campagne_phase : security_invoker = false (droits du propriétaire, filtre dans la vue)');
select is(has_table_privilege('anon', 'public.campagne_phase', 'select') and has_table_privilege('authenticated', 'public.campagne_phase', 'select'),
  true, 'anon et authenticated lisent campagne_phase');
select is_empty($$
  select d from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) d
  where has_table_privilege('service_role', 'public.campagne_phase', d)
$$, 'aucun droit du rôle de service sur campagne_phase');
select is(has_function_privilege('authenticated', 'public.ouvrir_campagne(uuid)', 'execute'), true, 'authenticated exécute ouvrir_campagne');
select is_empty($$
  select r from unnest(array['anon', 'service_role']) r where has_function_privilege(r, 'public.ouvrir_campagne(uuid)', 'execute')
$$, 'ni anon ni le rôle de service n''exécutent ouvrir_campagne');

-- ouvrir_campagne par rôle ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.ouvrir_campagne(current_setting('t.pub_b')::uuid)$$, '42501', null, 'le visiteur n''ouvre pas de campagne');
reset role;
set local role service_role;
select throws_ok($$select public.ouvrir_campagne(current_setting('t.pub_b')::uuid)$$, '42501', null, 'le rôle de service n''ouvre pas de campagne');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.ouvrir_campagne(current_setting('t.pub_b')::uuid)$$, 'CT404', 'Campagne introuvable.', 'un autre compte actif : introuvable');
select throws_ok($$select public.ouvrir_campagne(gen_random_uuid())$$, 'CT404', 'Campagne introuvable.', 'campagne absente : introuvable');
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
select throws_ok($$select public.ouvrir_campagne(current_setting('t.pub_b')::uuid)$$, 'CT404', 'Campagne introuvable.', 'le Boss d''une autre campagne : introuvable');
select throws_ok($$select public.ouvrir_campagne(current_setting('t.inv_b2')::uuid)$$, 'P0001', 'Seul un brouillon s''ouvre.', 'campagne déjà ouverte : refus');
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000c3","role":"authenticated"}';
select throws_ok($$select public.ouvrir_campagne(current_setting('t.bloque_z')::uuid)$$, 'P0001', 'Cette campagne est bloquée ou échue : elle ne s''ouvre plus.', 'brouillon bloqué : refus');
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000c4","role":"authenticated"}';
select throws_ok($$select public.ouvrir_campagne(current_setting('t.echue_e')::uuid)$$, 'P0001', 'Cette campagne est bloquée ou échue : elle ne s''ouvre plus.', 'brouillon échu : refus');
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000c5","role":"authenticated"}';
select throws_ok($$select public.ouvrir_campagne(current_setting('t.cloture_f')::uuid)$$, 'P0001', 'La clôture des dépôts est déjà passée.', 'clôture des dépôts à l''instant même : refus');
reset role;
update public.compte set etat = 'suspendu' where id = '80000000-0000-4000-8000-0000000000b1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.ouvrir_campagne(current_setting('t.pub_b')::uuid)$$, 'P0001', 'Ton compte n''est pas actif.', 'Boss suspendu : refus');
reset role;
update public.compte set etat = 'actif' where id = '80000000-0000-4000-8000-0000000000b1';
select is((select statut from public.campagne where slug in ('pub-b', 'bloque-z', 'echue-e', 'cloture-f') group by statut), 'brouillon',
  'les refus laissent les brouillons tels quels');
set local role authenticated;
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select lives_ok($$select public.ouvrir_campagne(current_setting('t.pub_b')::uuid)$$, 'le Boss ouvre son brouillon');
select is((select statut from public.campagne where slug = 'pub-b'), 'ouverte', 'statut ouverte');
select throws_ok($$select public.ouvrir_campagne(current_setting('t.pub_b')::uuid)$$, 'P0001', 'Seul un brouillon s''ouvre.', 'une seconde ouverture est refusée');
reset role;

-- Visibilité par rôle (campagne_phase) ------------------------------------------------------------------
set local role anon;
select results_eq($$select slug from public.campagne_phase order by slug$$, array['phase-p', 'pub-b'],
  'visiteur : publiques ouvertes seulement (ni brouillon, ni invitation, ni bloquée, ni expirée)');
select is_empty($$select 1 from public.campagne_phase where slug = 'inv-b2'$$, 'visiteur : la campagne sur invitation est introuvable par son slug');
select throws_ok($$select 1 from public.campagne$$, '42501', null, 'visiteur : la table campagne reste fermée');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select results_eq($$select slug from public.campagne_phase order by slug$$, array['phase-p', 'pub-b'], 'compte actif : les mêmes');
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select results_eq($$select slug from public.campagne_phase order by slug$$, array['phase-p', 'pub-b'], 'Boss B : pas la campagne sur invitation d''un autre');
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
select results_eq($$select slug from public.campagne_phase order by slug$$, array['inv-b2', 'phase-p', 'pub-b'], 'Boss B2 : en plus, sa campagne sur invitation');
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select results_eq($$select slug from public.campagne_phase order by slug$$, array['phase-p', 'pub-b'], 'Boss X : pas son brouillon');
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-0000000000c2","role":"authenticated"}';
select results_eq($$select slug from public.campagne_phase order by slug$$, array['phase-p', 'pub-b'], 'Boss Y : ni sa campagne bloquée, ni son expirée');
select results_eq($$select boss_pseudo, phase, visibilite from public.campagne_phase where slug = 'pub-b'$$,
  $$values ('boss_b', 'a_venir', 'publique')$$, 'pseudo du Boss et phase (inscriptions à venir en 2090)');
reset role;
set local role service_role;
select throws_ok($$select 1 from public.campagne_phase$$, '42501', null, 'le rôle de service ne lit pas campagne_phase');
reset role;

-- Phases aux bornes exactes (lues par postgres : phase-p est publique) ------------------------------------
update public.campagne set ouverture_inscriptions = now(), cloture_depot = now() + interval '1 day', date_resultats = now() + interval '2 days' where slug = 'phase-p';
select is((select phase from public.campagne_phase where slug = 'phase-p'), 'inscriptions', 'ouverture à l''instant même : inscriptions');
update public.campagne set ouverture_inscriptions = now() + interval '1 microsecond' where slug = 'phase-p';
select is((select phase from public.campagne_phase where slug = 'phase-p'), 'a_venir', 'ouverture une microseconde plus tard : à venir');
update public.campagne set ouverture_inscriptions = now() - interval '1 day', cloture_depot = now() + interval '1 microsecond' where slug = 'phase-p';
select is((select phase from public.campagne_phase where slug = 'phase-p'), 'inscriptions', 'clôture une microseconde plus tard : inscriptions et dépôt');
update public.campagne set cloture_depot = now() where slug = 'phase-p';
select is((select phase from public.campagne_phase where slug = 'phase-p'), 'depots_clos', 'clôture à l''instant même : dépôts clos');
select is((select statut from public.campagne_phase where slug = 'phase-p'), 'ouverte', 'dépôts clos : le statut reste ouverte');
update public.campagne set statut = 'deliberation' where slug = 'phase-p';
select is((select phase from public.campagne_phase where slug = 'phase-p'), 'deliberation', 'hors ouverte, la phase vaut le statut : délibération');
update public.campagne set statut = 'prete' where slug = 'phase-p';
select is((select phase from public.campagne_phase where slug = 'phase-p'), 'prete', 'prête');
update public.campagne set statut = 'publiee' where slug = 'phase-p';
select is((select phase from public.campagne_phase where slug = 'phase-p'), 'publiee', 'publiée');
update public.campagne set statut = 'archivee' where slug = 'phase-p';
select is((select phase from public.campagne_phase where slug = 'phase-p'), 'archivee', 'archivée');
update public.campagne set bloquee_le = now(), motif_blocage = 'Essai' where slug = 'phase-p';
select is_empty($$select 1 from public.campagne_phase where slug = 'phase-p'$$, 'bloquée après coup : masquée (AD-10)');

select * from finish();
rollback;
