-- Réception du dépôt : table reception, vue ma_reception, bucket privé, places restantes.
-- Alice (0a) et Bob (0b) sont inscrits à seed-ouverte (…02) et ont chacun une réception.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

insert into public.participation (id, campagne_id, compte_id) values
  ('30000000-0000-4000-8000-0000000000f1', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a'),
  ('30000000-0000-4000-8000-0000000000f2', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000b');
insert into public.reception (participation_id, chemin_stockage, presentation, type_code, declaration_code_le, contact_reutilisation) values
  ('30000000-0000-4000-8000-0000000000f1', '2/f1/a.zip', 'Présentation d''Alice.', 'open_source', now(), true),
  ('30000000-0000-4000-8000-0000000000f2', '2/f2/b.zip', 'Présentation de Bob.', 'proprietaire', now(), false);

-- 1. Bucket : privé, 20 Mo, zip, et aucune politique de stockage -----------------------------------
select is((select public from storage.buckets where id = 'depots'), false, 'le bucket depots est privé');
select is((select file_size_limit from storage.buckets where id = 'depots'), 20971520::bigint, 'limité à 20 Mo');
select is((select allowed_mime_types from storage.buckets where id = 'depots'), array['application/zip'], 'zip seulement');
select is_empty($$select 1 from pg_policies where schemaname = 'storage'$$, 'aucune politique de stockage : refus par défaut');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*) from storage.objects), 0::bigint, 'authenticated ne lit aucun objet');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('depots', 'x/y/z.zip')$$, '42501', null, 'authenticated n''écrit aucun objet');
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$insert into storage.objects (bucket_id, name) values ('depots', 'x/y/z.zip')$$, '42501', null, 'anon n''écrit aucun objet');
reset role;

-- 2. Anonyme -------------------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select 1 from public.reception', '42501', null, 'anon ne lit pas reception');
select throws_ok('select 1 from public.ma_reception', '42501', null, 'anon ne lit pas ma_reception');
select throws_ok($$insert into public.reception (participation_id, chemin_stockage, presentation, type_code, declaration_code_le)
  values ('30000000-0000-4000-8000-0000000000f1', 'x', 'x', 'open_source', now())$$, '42501', null, 'anon n''écrit pas dans reception');

-- 3. Alice : la sienne seulement, jamais le chemin, aucune écriture ------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*) from public.ma_reception), 1::bigint, 'A lit une seule réception');
select is((select presentation from public.ma_reception), 'Présentation d''Alice.', 'la sienne');
select is((select etat::text from public.ma_reception), 'en_attente', 'en attente');
select is((select contact_reutilisation from public.ma_reception), true, 'avec sa case de réutilisation');
select is((select count(*) from public.ma_reception where participation_id = '30000000-0000-4000-8000-0000000000f2'), 0::bigint, 'pas celle de B');
select columns_are('public', 'ma_reception',
  array['participation_id', 'presentation', 'demande', 'type_code', 'outils_ia', 'contact_reutilisation',
        'declaration_code_le', 'etat', 'motifs_refus', 'recue_le', 'traitee_le'],
  'ma_reception n''expose pas chemin_stockage');
select throws_ok('select chemin_stockage from public.ma_reception', '42703', null, 'chemin_stockage absent de la vue');
select is((select count(*) from public.reception), 0::bigint, 'A ne lit rien dans la table reception elle-même');
select throws_ok('select contact_reutilisation from public.reception', '42501', null, 'ni la case directement');
select throws_ok($$insert into public.reception (participation_id, chemin_stockage, presentation, type_code, declaration_code_le)
  values ('30000000-0000-4000-8000-0000000000f1', 'x', 'x', 'open_source', now())$$, '42501', null, 'A n''insère pas');
select throws_ok($$update public.reception set etat = 'acceptee'$$, '42501', null, 'A ne modifie pas');
select throws_ok($$delete from public.reception$$, '42501', null, 'A ne supprime pas');

-- 4. Bob : la sienne, pas celle d'Alice -------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is((select presentation from public.ma_reception), 'Présentation de Bob.', 'B lit la sienne');
select is((select count(*) from public.ma_reception), 1::bigint, 'et seulement la sienne');

-- 5. Compte sans participation -------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000d","role":"authenticated"}';
select is((select count(*) from public.ma_reception), 0::bigint, 'D n''a aucune réception');

-- 6. Organisateur : lit tout, sauf la case de réutilisation ------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.reception), 2::bigint, 'l''organisateur lit les deux réceptions');
select is((select chemin_stockage from public.reception where participation_id = '30000000-0000-4000-8000-0000000000f1'),
  '2/f1/a.zip', 'dont le chemin de stockage');
select throws_ok('select contact_reutilisation from public.reception', '42501', null, 'mais pas la case de réutilisation (vote à l''aveugle)');
select throws_ok($$update public.reception set etat = 'acceptee'$$, '42501', null, 'l''organisateur n''écrit pas non plus depuis le site');
select is((select count(*) from public.ma_reception), 0::bigint, 'ma_reception est personnelle, même pour l''organisateur');

-- 7. Contraintes et cascade (rôle de service simulé par le superutilisateur) -------------------------------
reset role;
select throws_ok($$insert into public.reception (participation_id, chemin_stockage, presentation, type_code, declaration_code_le)
  values ('30000000-0000-4000-8000-0000000000f1', 'x', 'y', 'open_source', now())$$, '23505', null, 'une seule réception par participation');
update public.participation set etat = 'retire', retire_le = now() where id = '30000000-0000-4000-8000-0000000000f2';
select throws_ok($$update public.reception set presentation = '' where participation_id = '30000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'présentation vide refusée');
select throws_ok($$update public.reception set presentation = repeat('a', 501) where participation_id = '30000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'présentation de 501 caractères refusée');
select lives_ok($$update public.reception set presentation = repeat('a', 500), demande = repeat('b', 80) where participation_id = '30000000-0000-4000-8000-0000000000f1'$$,
  '500 et 80 caractères acceptés');
select throws_ok($$update public.reception set demande = repeat('b', 81) where participation_id = '30000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'demande de 81 caractères refusée');
select throws_ok($$update public.reception set outils_ia = '{}' where participation_id = '30000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'outils_ia doit être un tableau');
select throws_ok($$update public.reception set etat = 'acceptee' where participation_id = '30000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'acceptée sans date de traitement refusée');
select throws_ok($$update public.reception set traitee_le = now() where participation_id = '30000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'en attente avec date de traitement refusée');
select lives_ok($$update public.reception set etat = 'refusee', traitee_le = now(), motifs_refus = '[{"code":"licence","message":"Ajoute ta licence et redépose."}]'
  where participation_id = '30000000-0000-4000-8000-0000000000f1'$$, 'refus avec motifs accepté');
select is((select motifs_refus -> 0 ->> 'code' from public.reception where participation_id = '30000000-0000-4000-8000-0000000000f1'),
  'licence', 'les motifs sont gardés');
delete from public.participation where id = '30000000-0000-4000-8000-0000000000f1';
select is((select count(*) from public.reception where participation_id = '30000000-0000-4000-8000-0000000000f1'), 0::bigint,
  'la réception disparaît avec la participation');

-- 8. Places restantes ---------------------------------------------------------------------------------------------------
-- seed-ouverte : 3 places, Bob retiré, Alice supprimée : trois places restantes.
select is((select places_restantes from public.places_campagne where campagne_id = '20000000-0000-4000-8000-000000000002'), 3,
  'seed-ouverte : trois places quand personne n''est inscrit');
insert into public.participation (campagne_id, compte_id) values
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000c');
select is((select places_restantes from public.places_campagne where campagne_id = '20000000-0000-4000-8000-000000000002'), 1,
  'deux inscrits : une place');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select places_restantes from public.places_campagne where campagne_id = '20000000-0000-4000-8000-000000000002'), 1,
  'anon lit les places restantes');
select is_empty($$select 1 from public.places_campagne where campagne_id = '20000000-0000-4000-8000-000000000001'$$,
  'le brouillon n''apparaît pas');
select columns_are('public', 'places_campagne', array['campagne_id', 'places_restantes'], 'aucune donnée de participant dans la vue');

select * from finish();
rollback;
