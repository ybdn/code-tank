-- Lancement de la délibération (story 4.3) : colonnes de campagne, table engagement, droits (lancer_deliberation, lire_cle_boss,
-- effacer_cle_boss réservées au rôle de service ; vault fermé à anon et authenticated), refus avant toute écriture, lancement,
-- relance, plafond cumulé, borne de 48 h. Clés factices seulement. Rôles : Boss (B1), autre Boss (B2), candidat (A1), service.
begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

insert into auth.users (id, email)
select ('94000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org' from unnest(array['a1', 'a2', 'b1', 'b2']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('94000000-0000-4000-8000-0000000000' || h)::uuid, '94' || h, 'lance_' || h, now(), '2026-11-25', now(), 'actif'
from unnest(array['a1', 'a2', 'b1', 'b2']) h;
-- X : campagne du jeu connu (B1, dépôts clos, résultats dans 5 jours) ; Y : celle de B2, sans dépôt.
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
select s, ('94000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], 'publique', 'juge', 10,
  now() - interval '2 days', now() - interval '1 day', now() + interval '5 days'
from (values ('lancex', 'b1'), ('lancey', 'b2')) v(s, b);
update public.campagne set statut = 'ouverte' where slug like 'lance%';
select set_config('t.' || substr(slug, 6), id::text, true) from public.campagne where slug like 'lance%';

-- Dépôts de X : d1 (estimé 100 000 : 0,55 $ par audit), d2 (estimé 20 000 : 0,23 $), d3 (trop_gros : exclu). Pire cas : 3,12 $.
insert into public.participation (id, campagne_id, compte_id, connaissance_envoi_le) values
  ('94000000-0000-4000-8000-0000000000f1', current_setting('t.x')::uuid, '94000000-0000-4000-8000-0000000000a1', now()),
  ('94000000-0000-4000-8000-0000000000f2', current_setting('t.x')::uuid, '94000000-0000-4000-8000-0000000000a2', now()),
  ('94000000-0000-4000-8000-0000000000f3', current_setting('t.x')::uuid, null, now());
insert into public.depot (id, participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, trop_gros, presentation, droit_declare_le)
select ('94000000-0000-4000-8000-0000000000d' || n)::uuid, ('94000000-0000-4000-8000-0000000000f' || n)::uuid,
  gen_random_uuid() || '/' || gen_random_uuid() || '/' || gen_random_uuid() || '.zip', repeat('a', 64), 1, e, g, 'Présentation', now()
from (values (1, 100000, false), (2, 20000, false), (3, 90000, true)) v(n, e, g);

-- Colonnes et table.
select has_column('public', 'campagne', 'plafond_usd', 'campagne porte plafond_usd');
select has_column('public', 'campagne', 'lancements', 'campagne porte lancements');
select has_column('public', 'campagne', 'cle_fin', 'campagne porte cle_fin');
select col_default_is('public', 'campagne', 'lancements', '0', 'aucun lancement à la création');
select hasnt_column('public', 'campagne', 'cle', 'aucune colonne ne porte la clé');
select columns_are('public', 'engagement', array['id', 'campagne_id', 'compte_id', 'version', 'accepte_le'], 'engagement : colonnes');
select throws_ok($$update public.campagne set cle_fin = 'abc' where slug = 'lancex'$$, '23514', null, 'cle_fin : 4 caractères exactement');
select throws_ok($$update public.campagne set lancements = 4 where slug = 'lancex'$$, '23514', null, 'quatre lancements : refus');
select throws_ok($$update public.campagne set plafond_usd = 0 where slug = 'lancex'$$, '23514', null, 'plafond nul : refus');

-- Droits.
select is_empty($$
  select f, r from unnest(array['public.lancer_deliberation(uuid, uuid, text, numeric, text)', 'public.lire_cle_boss(uuid)',
    'public.effacer_cle_boss(uuid)']) f, unnest(array['anon', 'authenticated']) r where has_function_privilege(r, f, 'execute')
$$, 'anon et authenticated n''exécutent ni lancer_deliberation, ni lire_cle_boss, ni effacer_cle_boss');
select is_empty($$
  select 1 from information_schema.routine_privileges
  where routine_name in ('lancer_deliberation', 'lire_cle_boss', 'effacer_cle_boss') and grantee = 'PUBLIC'
$$, 'PUBLIC n''exécute ni lancer_deliberation, ni lire_cle_boss, ni effacer_cle_boss');
select is_empty($$
  select f from unnest(array['public.lancer_deliberation(uuid, uuid, text, numeric, text)', 'public.lire_cle_boss(uuid)',
    'public.effacer_cle_boss(uuid)']) f where not has_function_privilege('service_role', f, 'execute')
$$, 'le rôle de service exécute les trois');
select is_empty($$
  select r from unnest(array['anon', 'authenticated', 'service_role']) r
  where has_table_privilege(r, 'public.engagement', 'select,insert,update,delete,truncate,references,trigger')
$$, 'engagement : aucun droit pour anon, authenticated ni le rôle de service');
select is_empty($$select policyname from pg_policies where schemaname = 'public' and tablename = 'engagement'$$, 'engagement : aucune politique');
select is_empty($$select 1 from pg_class where oid = 'public.engagement'::regclass and not relrowsecurity$$, 'engagement : RLS activée');
select is_empty($$
  select r from unnest(array['anon', 'authenticated']) r where has_schema_privilege(r, 'vault', 'usage')
$$, 'le schéma vault est fermé à anon et authenticated');
select is_empty($$
  select r, t from unnest(array['anon', 'authenticated']) r, unnest(array['vault.secrets', 'vault.decrypted_secrets']) t
  where has_table_privilege(r, t, 'select,insert,update,delete')
$$, 'les tables de vault sont fermées à anon et authenticated');
select is_empty($$
  select r from unnest(array['anon', 'authenticated']) r where has_function_privilege(r, 'vault.create_secret(text, text, text, uuid)', 'execute')
$$, 'vault.create_secret n''est exécutable ni par anon ni par authenticated');

-- Le rôle de service ne crée rien dans vault (anon et authenticated : refusés plus haut). Il y garde, par défaut de Supabase,
-- select et delete (non exposés par PostgREST, schéma public seul) : à durcir si même la clé de service ne doit pas lire Vault.
select is(has_schema_privilege('service_role', 'vault', 'create'), false, 'vault : le rôle de service ne crée rien dans le schéma');
-- Une exception levée après create_secret dans la même transaction ne laisse aucun secret.
select throws_ok($q$do $b$ begin perform vault.create_secret('valeur-factice', 'cle_essai_annulation'); raise exception 'échec après le rangement'; end $b$$q$,
  'P0001', 'échec après le rangement', 'exception après create_secret');
select is((select count(*) from vault.secrets where name = 'cle_essai_annulation'), 0::bigint, 'l''exception annule le secret : aucun secret laissé');

-- depense_audits : authenticated et service, pas anon ni PUBLIC.
select is(has_function_privilege('anon', 'public.depense_audits(uuid)', 'execute'), false, 'anon n''exécute pas depense_audits');
select is_empty($$select 1 from information_schema.routine_privileges where routine_name = 'depense_audits' and grantee = 'PUBLIC'$$,
  'PUBLIC n''exécute pas depense_audits');
select is(has_function_privilege('authenticated', 'public.depense_audits(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.depense_audits(uuid)', 'execute'), true,
  'authenticated et le rôle de service exécutent depense_audits');
set local role authenticated;
set local request.jwt.claims = '{"sub":"94000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
select throws_ok($$select public.depense_audits(current_setting('t.x')::uuid)$$, '42501', 'Campagne introuvable.', 'un autre Boss ne lit pas le dépensé');
set local request.jwt.claims = '{"sub":"94000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select is(public.depense_audits(current_setting('t.x')::uuid), 0::numeric, 'le Boss lit le dépensé de sa campagne : 0 sans audit');
reset role;
set local role anon;
select throws_ok($$select public.depense_audits(current_setting('t.x')::uuid)$$, '42501', null, 'le visiteur n''exécute pas depense_audits');
reset role;

-- Par /rest/v1/rpc : ni le Boss, ni un visiteur.
set local role authenticated;
set local request.jwt.claims = '{"sub":"94000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  '42501', null, 'le Boss n''appelle pas lancer_deliberation lui-même');
select throws_ok($$select public.lire_cle_boss(current_setting('t.x')::uuid)$$, '42501', null, 'le Boss ne lit pas sa clé');
select throws_ok($$select public.effacer_cle_boss(current_setting('t.x')::uuid)$$, '42501', null, 'le Boss n''efface pas sa clé');
reset role;
set local role anon;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  '42501', null, 'le visiteur n''appelle pas lancer_deliberation');
reset role;

-- Refus, tous avant la moindre écriture (rôle de service, comme la route).
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b2', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'CT404', 'Campagne introuvable.', 'un autre compte n''est pas le Boss');
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', '94000000-0000-4000-8000-000000000000', 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'CT404', 'Campagne introuvable.', 'campagne inconnue : même refus');
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'jeton-d-abonnement', 4, 'v1')$$,
  'P0001', 'Clé refusée.', 'clé hors format : refus sans écho');
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-oat01-FAUSSECLECANARI0123!', 4, 'v1')$$,
  'P0001', 'Clé refusée.', 'clé hors jeu de caractères : refus sans écho');
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 0, 'v1')$$,
  'P0001', 'Le plafond est un montant en dollars, de 0,01 à 10 000.', 'plafond nul : refus');
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 0.005, 'v1')$$,
  'P0001', 'Le plafond est un montant en dollars, de 0,01 à 10 000.', 'plafond sous 0,01 $ : refus');
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 10001, 'v1')$$,
  'P0001', 'Le plafond est un montant en dollars, de 0,01 à 10 000.', 'plafond hors borne : refus');
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 3, 'v1')$$,
  'P0001', 'Plafond insuffisant : il manque 0,12 $.', 'plafond sous le pire cas : refus avec l''écart');
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 3.12, null)$$,
  'P0001', 'Les engagements ne sont pas acceptés.', 'sans version d''engagements : refus');
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b2', current_setting('t.y')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'P0001', 'Aucun dépôt à auditer.', 'aucun dépôt à auditer : refus');
reset role;

update public.compte set etat = 'suspendu' where id = '94000000-0000-4000-8000-0000000000b1';
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'P0001', 'Ton compte n''est pas actif.', 'compte suspendu : refus');
reset role;
update public.compte set etat = 'actif' where id = '94000000-0000-4000-8000-0000000000b1';

update public.campagne set bloquee_le = now(), motif_blocage = 'Essai' where id = current_setting('t.x')::uuid;
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'P0001', 'Cette campagne est bloquée ou échue : la délibération ne part plus.', 'campagne bloquée : refus');
reset role;
update public.campagne set bloquee_le = null, motif_blocage = null where id = current_setting('t.x')::uuid;

update public.campagne set ouverture_inscriptions = now() - interval '4 days', cloture_depot = now() - interval '3 days',
  date_resultats = now() - interval '1 day' where id = current_setting('t.x')::uuid;
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'P0001', 'Cette campagne est bloquée ou échue : la délibération ne part plus.', 'campagne échue : refus');
reset role;
update public.campagne set cloture_depot = now() + interval '1 day', date_resultats = now() + interval '5 days' where id = current_setting('t.x')::uuid;
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'P0001', 'Les dépôts ne sont pas encore clos.', 'dépôts pas clos : refus');
reset role;
update public.campagne set cloture_depot = now() - interval '1 day' where id = current_setting('t.x')::uuid;

insert into public.reception (participation_id, chemin_stockage, presentation, droit_declare_le)
values ('94000000-0000-4000-8000-0000000000f3', gen_random_uuid() || '/' || gen_random_uuid() || '/' || gen_random_uuid() || '.zip', 'Présentation', now());
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'P0001', 'Un dépôt est encore en cours de contrôle.', 'réception en attente : refus');
reset role;
delete from public.reception;

-- Borne de 48 h exactes : une seconde de moins, refus ; pile 48 h, accepté (now() est celui de la transaction).
update public.campagne set date_resultats = now() + interval '48 hours' - interval '1 second' where id = current_setting('t.x')::uuid;
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'P0001', 'Moins de 2 jours avant les résultats : la délibération ne peut plus partir.', '48 h moins une seconde avant les résultats : refus');
reset role;
update public.campagne set date_resultats = now() + interval '48 hours' where id = current_setting('t.x')::uuid;

update public.campagne set lancements = 3 where id = current_setting('t.x')::uuid;
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'P0001', 'Les trois lancements de la délibération sont consommés.', 'troisième lancement déjà consommé : refus');
reset role;
update public.campagne set lancements = 0 where id = current_setting('t.x')::uuid;

-- Brouillon : un autre statut que ouverte ou deliberation.
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
values ('lancez', '94000000-0000-4000-8000-0000000000a1', 'Titre', 'Thème', 'Brief', array['Go'], 'publique', 'juge', 10,
  now() - interval '2 days', now() - interval '1 day', now() + interval '5 days');
select set_config('t.z', id::text, true) from public.campagne where slug = 'lancez';
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000a1', current_setting('t.z')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, 'v1')$$,
  'P0001', 'La délibération se lance quand la campagne est ouverte et ses dépôts clos.', 'brouillon : refus');
reset role;

-- Les refus n'ont rien écrit.
select is((select count(*) from public.audit), 0::bigint, 'refus : aucun audit créé');
select is((select count(*) from public.engagement), 0::bigint, 'refus : aucun engagement');
select is((select count(*) from vault.secrets where name like 'cle_boss_%'), 0::bigint, 'refus : aucune clé rangée');
select is((select lancements || ':' || statut || ':' || coalesce(cle_fin, '-') || ':' || coalesce(plafond_usd::text, '-')
  from public.campagne where id = current_setting('t.x')::uuid), '0:ouverte:-:-', 'refus : la campagne n''a pas bougé');

-- Lancement : pile 48 h avant les résultats, plafond 4 $ pour 3,12 $ de pire cas.
set local role service_role;
select is(public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0123', 4, '2026-11-26'),
  '{"cle_fin": "0123", "lancements": 1}'::jsonb, 'lancement : ne rend que les 4 derniers caractères et le nombre de lancements');
reset role;
select is((select statut || ':' || lancements || ':' || cle_fin || ':' || plafond_usd from public.campagne where id = current_setting('t.x')::uuid),
  'deliberation:1:0123:4', 'campagne en délibération, un lancement, plafond et cle_fin posés');
select is((select count(*) from public.audit), 8::bigint, '2 dépôts × 4 jurés = 8 audits (d3 trop_gros exclu)');
select is((select count(*) from public.audit where statut = 'a_envoyer'), 8::bigint, 'tous créés en a_envoyer');
select is_empty($$select 1 from public.audit where depot_id = '94000000-0000-4000-8000-0000000000d3'$$, 'aucun audit pour un dépôt trop_gros');
select is((select version || ':' || compte_id from public.engagement where campagne_id = current_setting('t.x')::uuid),
  '2026-11-26:94000000-0000-4000-8000-0000000000b1', 'engagement : version et compte');
select isnt((select accepte_le from public.engagement), null, 'engagement : daté');
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.x')), 1::bigint, 'la clé est rangée sous cle_boss_<campagne>');
select isnt((select secret from vault.secrets where name = 'cle_boss_' || current_setting('t.x')), 'sk-ant-api03-FAUSSECLECANARI0123', 'elle est chiffrée dans vault.secrets');
select is_empty($$
  select 1 from public.campagne where id = current_setting('t.x')::uuid
    and (cle_fin like '%FAUSSE%' or plafond_usd::text like '%FAUSSE%')
$$, 'la clé n''est dans aucune colonne de campagne');

set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0456', 4, 'v1')$$,
  'P0001', 'Une clé est déjà rangée : la délibération est en cours.', 'clé déjà présente : refus');
select is(public.lire_cle_boss(current_setting('t.x')::uuid), 'sk-ant-api03-FAUSSECLECANARI0123', 'le rôle de service lit la clé en délibération');
select is(public.lire_cle_boss(current_setting('t.y')::uuid), null, 'campagne sans clé : null');
reset role;
select is((select count(*) from public.engagement), 1::bigint, 'le refus n''a pas écrit d''engagement');

-- lire_cle_boss rend null hors délibération, même avec un secret : secret posé à la main sur Y (ouverte).
select vault.create_secret('valeur-factice', 'cle_boss_' || current_setting('t.y'));
set local role service_role;
select is(public.lire_cle_boss(current_setting('t.y')::uuid), null, 'campagne ouverte : lire_cle_boss rend null');
reset role;
delete from vault.secrets where name = 'cle_boss_' || current_setting('t.y');

-- Effacement.
set local role service_role;
select lives_ok($$select public.effacer_cle_boss(current_setting('t.x')::uuid)$$, 'effacer_cle_boss');
select lives_ok($$select public.effacer_cle_boss(current_setting('t.x')::uuid)$$, 'effacer_cle_boss sans clé : sans effet');
select is(public.lire_cle_boss(current_setting('t.x')::uuid), null, 'clé effacée : lire_cle_boss rend null');
reset role;
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.x')), 0::bigint, 'le secret n''existe plus');
select is((select cle_fin from public.campagne where id = current_setting('t.x')::uuid), null, 'cle_fin remis à null');
select is((select lancements from public.campagne where id = current_setting('t.x')::uuid), 1, 'le lancement reste compté');

-- Relance : d1 sudo termine (1 $), d1 refacto echec (0,25 $ payé), d2 lint supprimé (manquant) ; dépensé 1,25 $, pire cas =
-- d1 refacto, lint, pitch (3 × 0,55 $) + d2 sudo, refacto, pitch, lint (4 × 0,23 $) = 2,57 $ ; total 3,82 $.
update public.audit set statut = 'termine', cout_usd = 1 where depot_id = '94000000-0000-4000-8000-0000000000d1' and jure = 'sudo';
update public.audit set statut = 'echec', cout_usd = 0.25, batch_id = 'lot', resultat = '{}', usage = '{}'
  where depot_id = '94000000-0000-4000-8000-0000000000d1' and jure = 'refacto';
delete from public.audit where depot_id = '94000000-0000-4000-8000-0000000000d2' and jure = 'lint';
set local role service_role;
select throws_ok($$select public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0abc', 3.8, 'v1')$$,
  'P0001', 'Plafond insuffisant : il manque 0,02 $.', 'relance : le plafond porte sur le cumul des lancements');
select is(public.lancer_deliberation('94000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECANARI0abc', 3.82, 'v2'),
  '{"cle_fin": "0abc", "lancements": 2}'::jsonb, 'relance : plafond relevé, accepté pile au cumul');
reset role;
select is((select count(*) from public.audit), 8::bigint, 'relance : l''audit manquant est recréé, aucun doublon');
select is((select statut || ':' || coalesce(batch_id, '-') || ':' || coalesce(resultat::text, '-') || ':' || coalesce(usage::text, '-') || ':' || cout_usd
  from public.audit where depot_id = '94000000-0000-4000-8000-0000000000d1' and jure = 'refacto'), 'a_envoyer:-:-:-:0.25',
  'relance : l''audit en echec repart en a_envoyer, son coût payé reste');
select is((select statut from public.audit where depot_id = '94000000-0000-4000-8000-0000000000d1' and jure = 'sudo'), 'termine', 'relance : un audit terminé ne bouge pas');
select is((select lancements || ':' || cle_fin || ':' || plafond_usd from public.campagne where id = current_setting('t.x')::uuid), '2:0abc:3.82', 'relance : deux lancements, nouvelle clé, nouveau plafond');
select is((select count(*) from public.engagement where campagne_id = current_setting('t.x')::uuid), 2::bigint, 'un engagement par lancement');

-- Suppression de la campagne : les engagements suivent.
delete from vault.secrets where name like 'cle_boss_%';
select lives_ok($$delete from public.campagne where id = current_setting('t.x')::uuid$$, 'la campagne se supprime');
select is((select count(*) from public.engagement), 0::bigint, 'les engagements suivent la campagne');

select * from finish();
rollback;
