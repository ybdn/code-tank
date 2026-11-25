-- Dépôt (story 3.3) : bucket depots, tables reception et depot, peut_deposer, deposer, retirer_depot, effacer_archives, par
-- rôle : visiteur, candidat (A1), autre candidat (A2), compte non inscrit (A3), compte en attente (E1), Boss juge (B1),
-- Boss joueur (B2), rôle de service. Identité simulée par le rôle et request.jwt.claims. La phase de dépôt exige now() entre
-- l'ouverture et la clôture : ces campagnes ont des dates relatives à now() ; « avenir », des dates fixes en 2090.
-- Les objets du bucket et les lignes depot (écrites par prive, story 3.4) sont posés en superutilisateur.
begin;
create extension if not exists pgtap with schema extensions;
select plan(77);

insert into auth.users (id, email)
select ('91000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org'
from unnest(array['a1', 'a2', 'a3', 'e1', 'b1', 'b2', 'b3', 'b4', 'b5']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('91000000-0000-4000-8000-0000000000' || h)::uuid, '91' || h, 'depot_' || h, now(), '2026-11-25', now(),
  case h when 'e1' then 'en_attente' else 'actif' end
from unnest(array['a1', 'a2', 'a3', 'e1', 'b1', 'b2', 'b3', 'b4', 'b5']) h;

insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
select s, ('91000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], 'publique', r, 5, o, c, d
from (values
  ('ddpub', 'b1', 'juge', now() - interval '1 day', now() + interval '10 days', now() + interval '20 days'),
  ('ddjou', 'b2', 'joueur', now() - interval '1 day', now() + interval '10 days', now() + interval '20 days'),
  ('ddclos', 'b3', 'juge', now() - interval '3 days', now() - interval '1 hour', now() + interval '5 days'),
  ('ddavenir', 'b4', 'juge', timestamptz '2090-06-01 09:00 Europe/Paris', timestamptz '2090-06-10 09:00 Europe/Paris', timestamptz '2090-06-20 09:00 Europe/Paris'),
  ('dddelib', 'b5', 'juge', now() - interval '1 day', now() + interval '10 days', now() + interval '20 days')) v(s, b, r, o, c, d);
update public.campagne set statut = 'ouverte' where slug like 'dd%';
update public.campagne set statut = 'deliberation' where slug = 'dddelib';
select set_config('t.d_' || substr(slug, 3), id::text, true) from public.campagne where slug like 'dd%';

-- Participations : A1 et A2 à d-pub, A1 aux autres campagnes, le Boss joueur à la sienne.
insert into public.participation (id, campagne_id, compte_id, connaissance_envoi_le) values
  ('91000000-0000-4000-8000-0000000000f1', current_setting('t.d_pub')::uuid, '91000000-0000-4000-8000-0000000000a1', now()),
  ('91000000-0000-4000-8000-0000000000f2', current_setting('t.d_pub')::uuid, '91000000-0000-4000-8000-0000000000a2', now()),
  ('91000000-0000-4000-8000-0000000000f3', current_setting('t.d_clos')::uuid, '91000000-0000-4000-8000-0000000000a1', now()),
  ('91000000-0000-4000-8000-0000000000f4', current_setting('t.d_jou')::uuid, '91000000-0000-4000-8000-0000000000b2', now()),
  ('91000000-0000-4000-8000-0000000000f5', current_setting('t.d_avenir')::uuid, '91000000-0000-4000-8000-0000000000a1', now()),
  ('91000000-0000-4000-8000-0000000000f6', current_setting('t.d_delib')::uuid, '91000000-0000-4000-8000-0000000000a1', now());
-- Chemins : <campagne>/<participation>/<uuid>.zip. c1 à c4 pour A1, c9 pour A2, j1 pour le Boss joueur.
select set_config('t.c' || n, current_setting('t.d_pub') || '/91000000-0000-4000-8000-0000000000f1/9a000000-0000-4000-8000-00000000000' || n || '.zip', true)
from generate_series(0, 4) n;
select set_config('t.c9', current_setting('t.d_pub') || '/91000000-0000-4000-8000-0000000000f2/9a000000-0000-4000-8000-000000000009.zip', true);
select set_config('t.j1', current_setting('t.d_jou') || '/91000000-0000-4000-8000-0000000000f4/9a000000-0000-4000-8000-000000000001.zip', true);
insert into storage.objects (bucket_id, name)
select 'depots', current_setting('t.' || k) from unnest(array['c0', 'c1', 'c2', 'c3', 'c9', 'j1']) k;

-- Bucket, privilèges et schéma ------------------------------------------------------------------------------------
select results_eq($$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'depots'$$,
  $$values (false, 20971520::bigint, array['application/zip'])$$, 'bucket depots : privé, 20 Mo, zip seulement');
select is_empty($$select 1 from pg_policies where schemaname = 'storage'$$, 'aucune politique de stockage : refus par défaut');
select is((select relrowsecurity from pg_class where oid = 'public.reception'::regclass), true, 'RLS activée sur reception');
select is((select relrowsecurity from pg_class where oid = 'public.depot'::regclass), true, 'RLS activée sur depot');
select policies_are('public', 'reception', array['reception_lecture'], 'reception : une seule politique, lecture de ses lignes');
select policies_are('public', 'depot', array['depot_lecture'], 'depot : une seule politique, lecture de ses lignes');
select is_empty($$
  select t, d from unnest(array['public.reception', 'public.depot']) t,
    unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) d
  where has_table_privilege('authenticated', t, d)
$$, 'authenticated : aucun droit de table sur reception ni depot (lecture par colonnes)');
select is_empty($$
  select r, t from unnest(array['anon', 'service_role']) r, unnest(array['public.reception', 'public.depot']) t
  where has_table_privilege(r, t, 'select,insert,update,delete,truncate,references,trigger')
    or has_any_column_privilege(r, t, 'select,insert,update,references')
$$, 'aucun droit sur reception ni depot pour anon ni pour le rôle de service');
select is_empty($$
  select t, c from (values ('public.reception', 'chemin_stockage'), ('public.reception', 'tentatives'), ('public.depot', 'chemin_stockage'),
    ('public.depot', 'chemin_filtre'), ('public.depot', 'faits'), ('public.depot', 'note_outillage'),
    ('public.depot', 'alerte_manipulation'), ('public.depot', 'alertes_integrite')) v(t, c)
  where has_column_privilege('authenticated', t, c, 'select')
$$, 'authenticated ne lit ni les chemins, ni les tentatives, ni les faits, la note d''outillage et les alertes');
select is_empty($$
  select r, f from unnest(array['anon', 'service_role']) r,
    unnest(array['public.peut_deposer(uuid)', 'public.deposer(uuid, text, text, text, boolean)', 'public.retirer_depot(uuid)']) f
  where has_function_privilege(r, f, 'execute')
$$, 'ni anon ni le rôle de service n''exécutent peut_deposer, deposer ni retirer_depot');
select is_empty($$
  select f from unnest(array['public.peut_deposer(uuid)', 'public.deposer(uuid, text, text, text, boolean)', 'public.retirer_depot(uuid)']) f
  where not has_function_privilege('authenticated', f, 'execute')
$$, 'authenticated exécute peut_deposer, deposer et retirer_depot');
select results_eq($$select r, has_function_privilege(r, 'public.effacer_archives(public.depot)', 'execute')
  from unnest(array['anon', 'authenticated', 'service_role']) r$$,
  $$values ('anon', false), ('authenticated', false), ('service_role', true)$$, 'effacer_archives : rôle de service seul');
select col_is_unique('public', 'reception', 'participation_id', 'une réception au plus par participation');
select col_is_unique('public', 'depot', 'participation_id', 'un seul dépôt actif par participation');
select has_column('public', 'reception', 'tentatives', 'reception porte tentatives');
select columns_are('public', 'depot', array['id', 'participation_id', 'chemin_stockage', 'chemin_filtre', 'sha256', 'nb_fichiers',
  'fichiers_exclus', 'nb_tokens_estime', 'nb_tokens_exact', 'trop_gros', 'faits', 'note_outillage', 'alerte_manipulation',
  'alertes_integrite', 'presentation', 'demande', 'droit_declare_le', 'depose_le'], 'depot : colonnes de la spine');
select ok(pg_get_functiondef('public.deposer(uuid, text, text, text, boolean)'::regprocedure) ~ 'for update'
  and pg_get_functiondef('public.retirer_depot(uuid)'::regprocedure) ~ 'for update', 'deposer et retirer_depot verrouillent la ligne campagne');

-- Visiteur et rôle de service -----------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), 'x', null, true)$$, '42501', null, 'le visiteur ne dépose pas');
select throws_ok($$select 1 from public.reception$$, '42501', null, 'le visiteur ne lit pas reception');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('depots', 'x/y/z.zip')$$, '42501', null, 'le visiteur n''écrit aucun objet');
reset role;
set local role service_role;
select throws_ok($$select public.retirer_depot(current_setting('t.d_pub')::uuid)$$, '42501', null, 'le rôle de service ne retire pas de dépôt');
select throws_ok($$select 1 from public.depot$$, '42501', null, 'le rôle de service ne lit pas depot');
reset role;

-- Refus de deposer, dans l'ordre des gardes ----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$insert into storage.objects (bucket_id, name) values ('depots', 'x/y/z.zip')$$, '42501', null, 'le candidat n''écrit aucun objet');
select is((select count(*) from storage.objects), 0::bigint, 'le candidat ne lit aucun objet');
select throws_ok($$select public.deposer(gen_random_uuid(), current_setting('t.c1'), 'x', null, true)$$, 'CT404', 'Campagne introuvable.', 'campagne absente : introuvable');
select throws_ok($$select public.deposer(current_setting('t.d_clos')::uuid, current_setting('t.c1'), 'x', null, true)$$, 'P0001', 'La date limite de dépôt est passée.', 'date limite passée : refus');
select throws_ok($$select public.deposer(current_setting('t.d_avenir')::uuid, current_setting('t.c1'), 'x', null, true)$$, 'P0001', 'Le dépôt n''est pas ouvert.', 'avant l''ouverture : refus');
select throws_ok($$select public.deposer(current_setting('t.d_delib')::uuid, current_setting('t.c1'), 'x', null, true)$$, 'P0001', 'Le dépôt n''est pas ouvert.', 'délibération : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), 'x', null, false)$$, 'P0001', 'Coche la case : tu dois avoir le droit de déposer ce code.', 'case non cochée : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), 'x', null, null)$$, 'P0001', 'Coche la case : tu dois avoir le droit de déposer ce code.', 'case absente : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), E' \t\n ', null, true)$$, 'P0001', 'La présentation fait entre 1 et 500 caractères.', 'présentation vide : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), null, null, true)$$, 'P0001', 'La présentation fait entre 1 et 500 caractères.', 'présentation absente : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), repeat('x', 501), null, true)$$, 'P0001', 'La présentation fait entre 1 et 500 caractères.', 'présentation de 501 caractères : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), 'x', repeat('y', 81), true)$$, 'P0001', 'La demande fait 80 caractères au plus.', 'demande de 81 caractères : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c4'), 'x', null, true)$$, 'P0001', 'Ton archive n''est pas arrivée : recommence l''envoi.', 'objet absent du bucket : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c9'), 'x', null, true)$$, 'P0001', 'Ton archive n''est pas arrivée : recommence l''envoi.', 'chemin d''une autre participation : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.d_pub') || '/91000000-0000-4000-8000-0000000000f1/../x.zip', 'x', null, true)$$, 'P0001', 'Ton archive n''est pas arrivée : recommence l''envoi.', 'chemin hors forme : refus');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), 'x', null, true)$$, 'P0001', 'Tu n''es pas inscrit à cette campagne.', 'compte non inscrit : refus');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), 'x', null, true)$$, 'P0001', 'Ton compte n''est pas actif.', 'compte en attente : refus');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), 'x', null, true)$$, 'P0001', 'Tu juges cette campagne : tu n''y déposes pas.', 'Boss juge : refus');
select throws_ok($$select public.peut_deposer(current_setting('t.d_pub')::uuid)$$, 'P0001', 'Tu juges cette campagne : tu n''y déposes pas.', 'peut_deposer : mêmes gardes');
reset role;
select results_eq($$select (select count(*) from public.reception), (select regles_figees_le from public.campagne where slug = 'ddpub')$$,
  $$values (0::bigint, null::timestamptz)$$, 'aucun refus n''a écrit de réception ni figé les règles');

-- Dépôt ----------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select is(public.peut_deposer(current_setting('t.d_pub')::uuid), '91000000-0000-4000-8000-0000000000f1'::uuid, 'peut_deposer rend la participation de l''appelant');
select lives_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), E'  Mon projet.\n', E' \t', true)$$, 'A1 dépose');
reset role;
select results_eq($$select participation_id, chemin_stockage, presentation, demande, statut, motifs, tentatives, droit_declare_le is not null from public.reception$$,
  $$values ('91000000-0000-4000-8000-0000000000f1'::uuid, current_setting('t.c1'), 'Mon projet.', null::text, 'en_attente', null::jsonb, 0, true)$$,
  'réception en_attente, textes rognés, demande vide nulle, droit déclaré daté');
select isnt((select regles_figees_le from public.campagne where slug = 'ddpub'), null, 'le premier dépôt fige les règles');
select is((select count(*) from public.debit where action = 'depot'
  and empreinte = encode(sha256(convert_to('91000000-0000-4000-8000-0000000000a1:compte', 'UTF8')), 'hex')), 1::bigint,
  'débit rangé sous l''empreinte du compte');
set local role authenticated;
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c2'), 'x', null, true)$$, 'P0001', 'Ton dépôt précédent est en cours de contrôle.', 'réception en attente : pas de second dépôt');
select throws_ok($$select public.peut_deposer(current_setting('t.d_pub')::uuid)$$, 'P0001', 'Ton dépôt précédent est en cours de contrôle.', 'réception en attente : peut_deposer refuse aussi (pas d''URL d''envoi)');
select throws_ok($$select public.retirer_depot(current_setting('t.d_pub')::uuid)$$, 'P0001', 'Ton dépôt est en cours de contrôle : attends son résultat pour le retirer.', 'réception en attente : pas de retrait');
select throws_ok($$select public.se_desinscrire(current_setting('t.d_pub')::uuid)$$, 'P0001', 'Retire d''abord ton dépôt pour te désinscrire.', 'réception en attente : pas de désinscription');
select throws_ok($$select chemin_stockage from public.reception$$, '42501', null, 'le candidat ne lit pas le chemin de sa réception');
select throws_ok($$update public.reception set statut = 'refusee'$$, '42501', null, 'le candidat ne modifie pas sa réception');
select throws_ok($$delete from public.reception$$, '42501', null, 'le candidat ne supprime pas sa réception');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
select lives_ok($$select public.deposer(current_setting('t.d_jou')::uuid, current_setting('t.j1'), 'Projet du Boss.', 'Je vise 8/10', true)$$, 'le Boss joueur inscrit dépose');
reset role;

-- prive refuse la réception d'A1 et a accepté plus tôt un dépôt de chaque candidat de d-pub (posés ici).
update public.reception set statut = 'refusee', motifs = '[{"code": "secret", "message": "Retire tes secrets."}]'
where participation_id = '91000000-0000-4000-8000-0000000000f1';
insert into public.depot (participation_id, chemin_stockage, chemin_filtre, sha256, nb_fichiers, nb_tokens_estime, presentation, droit_declare_le)
values ('91000000-0000-4000-8000-0000000000f1', current_setting('t.c0'), replace(current_setting('t.c0'), '.zip', '.filtre.zip'), repeat('a', 64), 3, 1200, 'Ancien.', now()),
  ('91000000-0000-4000-8000-0000000000f2', current_setting('t.c9'), null, repeat('b', 64), 2, 800, 'Celui de A2.', now());

-- Lecture par rôle : chacun ses lignes ---------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select results_eq($$select participation_id, statut, motifs from public.reception$$,
  $$values ('91000000-0000-4000-8000-0000000000f1'::uuid, 'refusee', '[{"code": "secret", "message": "Retire tes secrets."}]'::jsonb)$$,
  'le candidat lit sa réception refusée et ses motifs, rien d''autre');
select results_eq($$select participation_id, presentation from public.depot$$,
  $$values ('91000000-0000-4000-8000-0000000000f1'::uuid, 'Ancien.')$$, 'le candidat lit son dépôt, pas celui de l''autre');
select throws_ok($$select alertes_integrite from public.depot$$, '42501', null, 'le candidat ne lit pas les alertes de son dépôt');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select results_eq($$select participation_id from public.depot$$, array['91000000-0000-4000-8000-0000000000f2'::uuid], 'l''autre candidat ne lit que son dépôt');
select is_empty($$select 1 from public.reception$$, 'l''autre candidat ne lit pas la réception du premier');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select is_empty($$select 1 from public.depot union all select 1 from public.reception$$, 'le Boss ne lit ni dépôt ni réception (epic 5)');

-- Redépôt après refus ----------------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c0'), 'x', null, true)$$, 'P0001', 'Ton archive n''est pas arrivée : recommence l''envoi.', 'chemin du dépôt en place : refus');
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c1'), 'x', null, true)$$, 'P0001', 'Ton archive n''est pas arrivée : recommence l''envoi.', 'chemin de la réception refusée : refus');
select lives_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c2'), 'Nouvelle version.', 'Je vise 8/10', true)$$, 'redépôt après refus');
reset role;
select results_eq($$select chemin_stockage, presentation, demande, statut, motifs, tentatives from public.reception where participation_id = '91000000-0000-4000-8000-0000000000f1'$$,
  $$values (current_setting('t.c2'), 'Nouvelle version.', 'Je vise 8/10', 'en_attente', null::jsonb, 0)$$, 'la réception refusée est remplacée');

-- Retrait --------------------------------------------------------------------------------------------------------------
update public.reception set statut = 'refusee' where participation_id = '91000000-0000-4000-8000-0000000000f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select throws_ok($$select public.se_desinscrire(current_setting('t.d_pub')::uuid)$$, 'P0001', 'Retire d''abord ton dépôt pour te désinscrire.', 'dépôt en place : pas de désinscription');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.retirer_depot(current_setting('t.d_clos')::uuid)$$, 'P0001', 'Le dépôt est clos : tu ne peux plus le retirer.', 'après la clôture : pas de retrait');
select throws_ok($$select public.retirer_depot(current_setting('t.d_delib')::uuid)$$, 'P0001', 'Le dépôt est clos : tu ne peux plus le retirer.', 'délibération : pas de retrait');
select results_eq($$select public.retirer_depot(current_setting('t.d_pub')::uuid)$$,
  $$values (array[current_setting('t.c0'), replace(current_setting('t.c0'), '.zip', '.filtre.zip')])$$, 'retrait : rend le zip et l''archive filtrée');
select is_empty($$select 1 from public.depot$$, 'la ligne depot a disparu');
select throws_ok($$select public.retirer_depot(current_setting('t.d_pub')::uuid)$$, 'CT404', 'Tu n''as pas de dépôt dans cette campagne.', 'sans dépôt : 404');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.retirer_depot(current_setting('t.d_pub')::uuid)$$, 'CT404', 'Tu n''as pas de dépôt dans cette campagne.', 'non inscrit : 404');
reset role;
select is((select count(*) from public.depot where participation_id = '91000000-0000-4000-8000-0000000000f2'), 1::bigint, 'le dépôt de l''autre candidat reste');
select is(public.effacer_archives(d), array[current_setting('t.c9')], 'effacer_archives : sans archive filtrée, le zip seul')
from public.depot d where participation_id = '91000000-0000-4000-8000-0000000000f2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.se_desinscrire(current_setting('t.d_pub')::uuid)$$, 'sans dépôt ni réception en attente, la désinscription passe');
reset role;

-- Limite de débit par compte : 10 dépôts par 24 h -------------------------------------------------------------------------
update public.participation set etat = 'inscrit', retire_le = null where id = '91000000-0000-4000-8000-0000000000f1';
insert into public.debit (empreinte, action)
select encode(sha256(convert_to('91000000-0000-4000-8000-0000000000a1:compte', 'UTF8')), 'hex'), 'depot' from generate_series(1, 8);
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.deposer(current_setting('t.d_pub')::uuid, current_setting('t.c3'), 'x', null, true)$$, 'CT429', 'Trop de dépôts depuis ton compte. Réessaie plus tard.', '11e dépôt en 24 h : limite de débit');
reset role;
select is((select chemin_stockage from public.reception where participation_id = '91000000-0000-4000-8000-0000000000f1'), current_setting('t.c2'), 'le dépôt refusé n''a rien écrit');

select * from finish();
rollback;
