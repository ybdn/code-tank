-- Inscription et désinscription (story 2.3) : sinscrire, se_desinscrire, table participation, places restantes de la vue,
-- par rôle : visiteur, comptes actifs (A1 à A4), en attente (E), suspendu (S), Boss juge (BJ), Boss joueur (BP), Boss des
-- campagnes refusées, rôle de service. Identité simulée par le rôle et request.jwt.claims. La phase d'inscription exige
-- now() entre l'ouverture et la clôture : ces campagnes ont des dates relatives à now() ; les autres, des dates fixes en
-- 2090, hors changement d'heure.
begin;
create extension if not exists pgtap with schema extensions;
select plan(76);

insert into auth.users (id, email)
select ('90000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org'
from unnest(array['a1', 'a2', 'a3', 'a4', 'e1', 'e2', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('90000000-0000-4000-8000-0000000000' || h)::uuid, '90' || h, 'compte_' || h, now(), '2026-11-25', now(),
  case h when 'e1' then 'en_attente' when 'e2' then 'suspendu' else 'actif' end
from unnest(array['a1', 'a2', 'a3', 'a4', 'e1', 'e2', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']) h;

-- Une campagne par cas et par Boss (une seule campagne active par Boss), posée en SQL : naissance en brouillon, puis statut.
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats, jeton_invitation)
select s, ('90000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], v, r, 2,
  now() - interval '1 day', now() + interval '10 days', now() + interval '20 days',
  case v when 'invitation' then encode(extensions.gen_random_bytes(32), 'hex') end
from (values ('pub', 'b1', 'publique', 'juge'), ('jou', 'b2', 'publique', 'joueur'), ('inv', 'b3', 'invitation', 'juge'),
  ('brouillon', 'b4', 'publique', 'juge'), ('bloquee', 'b6', 'publique', 'juge'), ('delib', 'b7', 'publique', 'juge')) v(s, b, v, r);
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats) values
  ('avenir', '90000000-0000-4000-8000-0000000000b5', 'À venir', 'Thème', 'Brief', array['Go'], 'publique', 'juge', 2,
    timestamptz '2090-06-01 09:00 Europe/Paris', timestamptz '2090-06-10 09:00 Europe/Paris', timestamptz '2090-06-20 09:00 Europe/Paris'),
  ('echue', '90000000-0000-4000-8000-0000000000b8', 'Échue', 'Thème', 'Brief', array['Go'], 'publique', 'juge', 2,
    now() - interval '3 days', now() - interval '2 days', now() - interval '1 day'),
  ('expiree', '90000000-0000-4000-8000-0000000000b9', 'Expirée', 'Thème', 'Brief', array['Go'], 'publique', 'juge', 2,
    now() - interval '1 day', now() + interval '10 days', now() + interval '20 days');
update public.campagne set statut = 'ouverte' where slug in ('pub', 'jou', 'inv', 'bloquee', 'delib', 'avenir', 'echue');
update public.campagne set statut = 'expiree' where slug = 'expiree';
update public.campagne set statut = 'deliberation' where slug = 'delib';
update public.campagne set bloquee_le = now(), motif_blocage = 'Essai' where slug = 'bloquee';
select set_config('t.' || slug, id::text, true) from public.campagne;

-- Privilèges et schéma ---------------------------------------------------------------------------
select is((select relrowsecurity from pg_class where oid = 'public.participation'::regclass), true, 'RLS activée sur participation');
select policies_are('public', 'participation', array['participation_lecture'], 'participation : une seule politique, lecture de ses lignes');
select is(has_table_privilege('authenticated', 'public.participation', 'select'), true, 'authenticated : select sur participation (filtré par RLS)');
select is_empty($$
  select d from unnest(array['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) d
  where has_table_privilege('authenticated', 'public.participation', d)
$$, 'authenticated : aucune écriture sur participation');
select is_empty($$
  select r from unnest(array['anon', 'service_role']) r
  where has_table_privilege(r, 'public.participation', 'select,insert,update,delete,truncate,references,trigger')
$$, 'aucun droit de table sur participation pour anon ni pour le rôle de service (colonnes de prive : 12_controle)');
select is_empty($$
  select f from unnest(array['public.sinscrire(uuid, boolean, text)', 'public.se_desinscrire(uuid)']) f
  where not has_function_privilege('authenticated', f, 'execute')
$$, 'authenticated exécute sinscrire et se_desinscrire');
select is_empty($$
  select r, f from unnest(array['anon', 'service_role']) r, unnest(array['public.sinscrire(uuid, boolean, text)', 'public.se_desinscrire(uuid)']) f
  where has_function_privilege(r, f, 'execute')
$$, 'ni anon ni le rôle de service n''exécutent sinscrire ni se_desinscrire');
select col_is_unique('public', 'participation', array['campagne_id', 'compte_id'], 'une ligne par compte et par campagne');
select col_is_null('public', 'participation', 'compte_id', 'compte_id nul permis (compte supprimé)');
select col_not_null('public', 'participation', 'connaissance_envoi_le', 'connaissance_envoi_le obligatoire');

-- Visiteur et rôle de service ------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, '42501', null, 'le visiteur ne s''inscrit pas');
select throws_ok($$select public.se_desinscrire(current_setting('t.pub')::uuid)$$, '42501', null, 'le visiteur ne se désinscrit pas');
select throws_ok($$select 1 from public.participation$$, '42501', null, 'le visiteur ne lit pas participation');
select is((select places_restantes from public.campagne_phase where slug = 'pub'), 2, 'le visiteur lit les places restantes');
reset role;
set local role service_role;
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, '42501', null, 'le rôle de service n''inscrit pas');
select throws_ok($$select public.se_desinscrire(current_setting('t.pub')::uuid)$$, '42501', null, 'le rôle de service ne désinscrit pas');
select throws_ok($$select compte_id from public.participation$$, '42501', null, 'le rôle de service ne lit pas compte_id (deux colonnes pour prive, story 3.4)');
reset role;

-- Refus de sinscrire, dans l'ordre des gardes ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$insert into public.participation (campagne_id, compte_id, connaissance_envoi_le) values (current_setting('t.pub')::uuid, auth.uid(), now())$$,
  '42501', null, 'compte actif : pas d''insertion directe');
select throws_ok($$update public.participation set etat = 'retire'$$, '42501', null, 'compte actif : pas de mise à jour directe');
select throws_ok($$delete from public.participation$$, '42501', null, 'compte actif : pas de suppression directe');
select throws_ok($$select public.sinscrire(gen_random_uuid(), true)$$, 'CT404', 'Campagne introuvable.', 'campagne absente : introuvable');
select throws_ok($$select public.sinscrire(current_setting('t.inv')::uuid, true)$$, 'CT404', 'Campagne introuvable.', 'campagne sur invitation, sans jeton : introuvable');
select throws_ok($$select public.sinscrire(current_setting('t.brouillon')::uuid, true)$$, 'CT404', 'Campagne introuvable.', 'brouillon : introuvable');
select throws_ok($$select public.sinscrire(current_setting('t.bloquee')::uuid, true)$$, 'CT404', 'Campagne introuvable.', 'bloquée : introuvable');
select throws_ok($$select public.sinscrire(current_setting('t.expiree')::uuid, true)$$, 'CT404', 'Campagne introuvable.', 'expirée : introuvable');
select throws_ok($$select public.sinscrire(current_setting('t.echue')::uuid, true)$$, 'P0001', 'Cette campagne est échue : on ne s''y inscrit plus.', 'échue : refus');
select throws_ok($$select public.sinscrire(current_setting('t.avenir')::uuid, true)$$, 'P0001', 'Les inscriptions ne sont pas ouvertes.', 'inscriptions à venir : refus');
select throws_ok($$select public.sinscrire(current_setting('t.delib')::uuid, true)$$, 'P0001', 'Les inscriptions ne sont pas ouvertes.', 'délibération : refus');
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, false)$$, 'P0001', 'Coche la case : ton code sera envoyé à Anthropic.', 'case non cochée : refus');
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, null)$$, 'P0001', 'Coche la case : ton code sera envoyé à Anthropic.', 'case absente : refus');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'P0001', 'Ton compte n''est pas actif.', 'compte en attente : refus');
select throws_ok($$select public.se_desinscrire(current_setting('t.pub')::uuid)$$, 'P0001', 'Ton compte n''est pas actif.', 'compte en attente : pas de désinscription');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000e2","role":"authenticated"}';
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'P0001', 'Ton compte n''est pas actif.', 'compte suspendu : refus');
select throws_ok($$select public.se_desinscrire(current_setting('t.pub')::uuid)$$, 'P0001', 'Ton compte n''est pas actif.', 'compte suspendu : pas de désinscription');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'P0001', 'Tu juges cette campagne : tu ne t''y inscris pas.', 'Boss juge sur sa campagne : refus');
reset role;
select is((select count(*) from public.participation), 0::bigint, 'aucun refus n''a écrit de participation');

-- Inscription, places, complet --------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'A1 s''inscrit');
select results_eq($$select etat, connaissance_envoi_le is not null, inscrit_le is not null, retire_le is null from public.participation$$,
  $$values ('inscrit', true, true, true)$$, 'participation inscrite, prise de connaissance datée');
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'P0001', 'Tu es déjà inscrit.', 'deuxième inscription : refus');
select is((select places_restantes from public.campagne_phase where slug = 'pub'), 1, 'une place restante');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select lives_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'A2 s''inscrit');
select results_eq($$select compte_id from public.participation$$, array['90000000-0000-4000-8000-0000000000a2'::uuid], 'A2 ne lit que sa ligne (RLS)');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'P0001', 'La campagne est complète.', 'campagne pleine : refus');
select is((select places_restantes from public.campagne_phase where slug = 'pub'), 0, 'plus de place');
select is_empty($$select 1 from public.participation$$, 'A3, refusé, n''a aucune ligne');
-- Le Boss ne descend pas sous le nombre d'inscrits.
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.modifier_campagne(id, titre, theme, brief, langages, visibilite, role_boss, 1, ouverture_inscriptions,
  cloture_depot, date_resultats) from public.campagne where slug = 'pub'$$,
  'P0001', 'Il y a déjà plus d''inscrits que ce nombre de places.', 'Boss : pas moins de places que d''inscrits');
select throws_ok($$select public.modifier_campagne(id, titre, theme, brief, langages, 'invitation', role_boss, max_participants, ouverture_inscriptions,
  cloture_depot, date_resultats) from public.campagne where slug = 'pub'$$,
  'P0001', 'La visibilité ne change plus une fois qu''il y a des inscrits.', 'Boss : pas de passage sur invitation avec des inscrits');
select is((select visibilite from public.campagne where slug = 'pub'), 'publique', 'la visibilité reste publique');

-- Désinscription et réinscription ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.se_desinscrire(current_setting('t.pub')::uuid)$$, 'A1 se désinscrit');
select results_eq($$select etat, retire_le is not null from public.participation$$, $$values ('retire', true)$$, 'participation retirée et datée');
select is((select places_restantes from public.campagne_phase where slug = 'pub'), 1, 'la place se libère');
select throws_ok($$select public.se_desinscrire(current_setting('t.pub')::uuid)$$, 'P0001', 'Tu n''es pas inscrit à cette campagne.', 'désinscription sans inscription : refus');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select lives_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'A3 prend la place libérée');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'P0001', 'La campagne est complète.', 'A1 ne revient pas : complet');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select lives_ok($$select public.se_desinscrire(current_setting('t.pub')::uuid)$$, 'A3 se désinscrit');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.sinscrire(current_setting('t.pub')::uuid, true)$$, 'A1 se réinscrit');
select results_eq($$select count(*), min(etat), bool_and(retire_le is null) from public.participation$$, $$values (1::bigint, 'inscrit', true)$$,
  'réinscription : la même ligne revient à inscrit, retrait effacé');
select throws_ok($$select public.se_desinscrire(current_setting('t.inv')::uuid)$$, 'CT404', 'Campagne introuvable.', 'désinscription d''une invitation : introuvable');
select throws_ok($$select public.se_desinscrire(current_setting('t.echue')::uuid)$$, 'P0001', 'Cette campagne est échue : on ne s''en désinscrit plus.', 'désinscription d''une échue : refus');
reset role;
insert into public.participation (campagne_id, compte_id, connaissance_envoi_le) values (current_setting('t.delib')::uuid, '90000000-0000-4000-8000-0000000000a1', now());
set local role authenticated;
select throws_ok($$select public.se_desinscrire(current_setting('t.delib')::uuid)$$, 'P0001', 'La délibération a commencé : tu ne peux plus te désinscrire.', 'délibération commencée : pas de désinscription');

-- Boss joueur ---------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
select lives_ok($$select public.sinscrire(current_setting('t.jou')::uuid, true)$$, 'le Boss joueur s''inscrit à sa campagne');
select is((select places_restantes from public.campagne_phase where slug = 'jou'), 1, 'il occupe une place');
select throws_ok($$select public.modifier_campagne(id, titre, theme, brief, langages, visibilite, 'juge', max_participants, ouverture_inscriptions,
  cloture_depot, date_resultats) from public.campagne where slug = 'jou'$$,
  'P0001', 'Tu es inscrit à ta campagne : désinscris-toi avant d''en devenir le juge.', 'Boss joueur inscrit : ne devient pas juge');

-- Limite de débit par compte : 20 inscriptions réussies par 24 h, la 21e refusée ----------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a4","role":"authenticated"}';
select lives_ok($q$do $d$ begin
  for i in 1..20 loop
    perform public.sinscrire(current_setting('t.jou')::uuid, true);
    perform public.se_desinscrire(current_setting('t.jou')::uuid);
  end loop;
end $d$$q$, '20 inscriptions et désinscriptions de suite passent');
select throws_ok($$select public.sinscrire(current_setting('t.jou')::uuid, true)$$, 'CT429', 'Trop d''inscriptions depuis ton compte. Réessaie plus tard.',
  '21e inscription : limite de débit');
select is((select etat from public.participation), 'retire', 'la 21e n''a rien écrit');
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select lives_ok($$select public.sinscrire(current_setting('t.jou')::uuid, true)$$, 'un autre compte n''est pas touché par cette limite');
-- jou est désormais rempli jusqu'à max_participants (le Boss joueur et A3) : le compte de plus est refusé.
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select is((select places_restantes from public.campagne_phase where slug = 'jou'), 0, 'jou rempli jusqu''à max_participants');
select throws_ok($$select public.sinscrire(current_setting('t.jou')::uuid, true)$$, 'P0001', 'La campagne est complète.', 'le compte de plus est refusé');
reset role;
select is((select count(*) from public.debit where action = 'inscription'
  and empreinte = encode(sha256(convert_to('90000000-0000-4000-8000-0000000000a4:compte', 'UTF8')), 'hex')), 20::bigint,
  'débit rangé sous l''empreinte du compte, jamais sous son id');

-- Sans inscrit, la visibilité se change encore.
set local request.jwt.claims = '{"sub":"90000000-0000-4000-8000-0000000000b5","role":"authenticated"}';
select lives_ok($$select public.modifier_campagne(id, titre, theme, brief, langages, 'invitation', role_boss, max_participants, ouverture_inscriptions,
  cloture_depot, date_resultats) from public.campagne where slug = 'avenir'$$, 'Boss sans inscrit : passage sur invitation accepté');
select is((select visibilite from public.campagne where slug = 'avenir'), 'invitation', 'visibilité changée');

-- Le verrou ne se prouve pas en pgTAP mono-session (test de concurrence dans tests/stack) : on vérifie qu'il est écrit.
select ok(pg_get_functiondef('public.sinscrire(uuid, boolean, text)'::regprocedure) ~ 'for update', 'sinscrire verrouille la ligne campagne (for update)');

-- Compte supprimé : la ligne reste, compte_id nul ------------------------------------------------------------
delete from auth.users where id = '90000000-0000-4000-8000-0000000000a2';
select results_eq($$select etat from public.participation where campagne_id = current_setting('t.pub')::uuid and compte_id is null$$,
  array['inscrit'], 'compte supprimé : sa ligne reste, compte_id nul');
select is((select places_restantes from public.campagne_phase where slug = 'pub'), 0,
  'compte supprimé : sa place reste prise jusqu''à la story 6.4 (AD-11)');
select is_empty($$select 1 from pg_constraint where conrelid = 'public.participation'::regclass and contype = 'f'
  and confrelid = 'public.campagne'::regclass and confdeltype <> 'c'$$, 'campagne supprimée : ses participations suivent (cascade)');

select * from finish();
rollback;
