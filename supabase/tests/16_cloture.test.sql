-- Clôture, fin et relance de la délibération (story 4.6) : droits (rôle de service seul), cloturer_deliberation (refus tant qu'un
-- lot est en cours, abandon, clé effacée, prete ou reste en deliberation), terminer_deliberation, relance jusqu'au troisième
-- lancement avec plafond cumulé, effacement de la clé à chaque sortie (expiree, suppression), cron des clés de plus de 48 h.
-- Clés factices seulement. Boss B1 à B8 (une campagne chacun : X, Y, W, V, U, T, S, R), candidats sans compte.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

insert into auth.users (id, email)
select ('96000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org' from unnest(array['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('96000000-0000-4000-8000-0000000000' || h)::uuid, '96' || h, 'clot_' || h, now(), '2026-11-25', now(), 'actif'
from unnest(array['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']) h;
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
select s, ('96000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], 'publique', 'juge', 10,
  now() - interval '2 days', now() - interval '1 day', now() + interval '5 days'
from (values ('clotx', 'b1'), ('cloty', 'b2'), ('clotw', 'b3'), ('clotv', 'b4'), ('clotu', 'b5'), ('clott', 'b6'), ('clots', 'b7'),
  ('clotr', 'b8')) v(s, b);
update public.campagne set statut = 'ouverte' where slug like 'clot%';
select set_config('t.' || substr(slug, 5), id::text, true) from public.campagne where slug like 'clot%';

-- Un dépôt de 50 000 tokens estimés par campagne (sauf R) : 0,35 $ par audit, 4 jurés, pire cas de 1,40 $. Y a en plus un dépôt trop_gros.
insert into public.participation (id, campagne_id, compte_id, connaissance_envoi_le)
select ('96000000-0000-4000-8000-0000000000f' || n)::uuid, current_setting('t.' || s)::uuid, null, now()
from (values (1, 'x'), (2, 'y'), (3, 'w'), (4, 'v'), (5, 'u'), (6, 't'), (7, 's'), (8, 'y')) v(n, s);
insert into public.depot (id, participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, trop_gros, presentation, droit_declare_le)
select ('96000000-0000-4000-8000-0000000000d' || n)::uuid, ('96000000-0000-4000-8000-0000000000f' || n)::uuid,
  gen_random_uuid() || '/' || gen_random_uuid() || '/' || gen_random_uuid() || '.zip', repeat('a', 64), 1, 50000, n = 8, 'Présentation', now()
from generate_series(1, 8) n;

-- Droits : rôle de service seul ; les fonctions internes ne sont exécutables par personne.
select is_empty($$
  select f, r from unnest(array['public.cloturer_deliberation(uuid, boolean)', 'public.terminer_deliberation(uuid, uuid)',
    'public.cloturer_cles_expirees()']) f, unnest(array['anon', 'authenticated']) r where has_function_privilege(r, f, 'execute')
$$, 'anon et authenticated n''exécutent ni cloturer_deliberation, ni terminer_deliberation, ni cloturer_cles_expirees');
select is_empty($$
  select 1 from information_schema.routine_privileges where grantee = 'PUBLIC'
    and routine_name in ('cloturer_deliberation', 'terminer_deliberation', 'cloturer_cles_expirees', 'effacer_cle_sortie',
      'audits_termines', 'abandonner_audits')
$$, 'PUBLIC n''exécute aucune des fonctions de la clôture');
select is_empty($$
  select f from unnest(array['public.cloturer_deliberation(uuid, boolean)', 'public.terminer_deliberation(uuid, uuid)',
    'public.cloturer_cles_expirees()']) f where not has_function_privilege('service_role', f, 'execute')
$$, 'le rôle de service exécute les trois');
select is_empty($$
  select f, r from unnest(array['public.effacer_cle_sortie()', 'public.audits_termines(uuid)', 'public.abandonner_audits(uuid)']) f,
    unnest(array['anon', 'authenticated', 'service_role']) r where has_function_privilege(r, f, 'execute')
$$, 'les fonctions internes ne sont exécutables par aucun rôle');

-- Lancements des campagnes X, Y, W, V, U, T, S : clé factice, plafond 2 $ pour 1,40 $ de pire cas.
set local role service_role;
select lives_ok(format($$select public.lancer_deliberation(%L, %L, 'sk-ant-api03-FAUSSECLECLOTURE0%s', 2, 'v1')$$,
  '96000000-0000-4000-8000-0000000000b' || n, current_setting('t.' || s), n), 'lancement de ' || upper(s))
from (values (1, 'x'), (2, 'y'), (3, 'w'), (4, 'v'), (5, 'u'), (6, 't'), (7, 's')) v(n, s);
reset role;
select is((select count(*) from vault.secrets where name like 'cle_boss_%'), 7::bigint, 'sept clés rangées');

-- X, premier cycle. Le jury travaille encore (clé rangée) : terminer_deliberation refuse ; un autre Boss ne trouve pas la campagne.
set local role service_role;
select throws_ok($$select public.terminer_deliberation('96000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid)$$,
  'P0001', 'Le jury travaille encore : la délibération ne se termine pas avant la fin de ses audits.', 'terminer avec une clé rangée : refus');
select throws_ok($$select public.terminer_deliberation('96000000-0000-4000-8000-0000000000b2', current_setting('t.x')::uuid)$$,
  'CT404', 'Campagne introuvable.', 'terminer par un autre Boss : introuvable');
reset role;
-- Un lot part (en_cours), un audit est terminé : la clôture attend le relevé du lot.
update public.audit set statut = 'en_cours', batch_id = 'lot' where depot_id = '96000000-0000-4000-8000-0000000000d1' and jure = 'sudo';
update public.audit set statut = 'termine', cout_usd = 0.3 where depot_id = '96000000-0000-4000-8000-0000000000d1' and jure = 'lint';
set local role service_role;
select throws_ok($$select public.cloturer_deliberation(current_setting('t.x')::uuid)$$, 'CT409', 'Des lots sont encore en cours : relève-les d''abord.',
  'un lot en cours : la clôture refuse');
reset role;
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.x')), 1::bigint, 'le refus a laissé la clé');
select is((select statut from public.audit where depot_id = '96000000-0000-4000-8000-0000000000d1' and jure = 'sudo'), 'en_cours', 'le refus n''a rien écrit');
-- Le lot est relevé (sudo en echec par enregistrer_audit, comme prive) : la clôture passe, la clé disparaît, la campagne reste.
set local role service_role;
select is(public.enregistrer_audit((select id from public.audit where depot_id = '96000000-0000-4000-8000-0000000000d1' and jure = 'sudo'),
  'echec', null, '[]'), 2.0 - 0.3, 'le lot relevé : le reste du plafond');
select is(public.cloturer_deliberation(current_setting('t.x')::uuid), 'deliberation', 'un audit a_envoyer et un echec : la campagne reste en délibération');
reset role;
select is((select string_agg(statut, ',' order by jure) from public.audit where depot_id = '96000000-0000-4000-8000-0000000000d1'),
  'termine,echec,echec,echec', 'les audits non terminés sont en echec, le terminé n''a pas bougé');
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.x')), 0::bigint, 'clôture : la clé n''est plus dans Vault');
select is((select statut || ':' || coalesce(cle_fin, '-') || ':' || lancements from public.campagne where id = current_setting('t.x')::uuid),
  'deliberation:-:1', 'clôture : en délibération, sans cle_fin, un lancement');
set local role service_role;
select is(public.lire_cle_boss(current_setting('t.x')::uuid), null, 'clé effacée : lire_cle_boss rend null');
select is(public.cloturer_deliberation(current_setting('t.x')::uuid), 'deliberation', 'clôture rejouée : sans effet');

-- Relance 1 : plafond 2 $ (rien payé sur les echec, 0,3 $ sur le terminé : dépensé 0,3 $, pire cas 3 × 0,35 = 1,05 $).
select throws_ok($$select public.lancer_deliberation('96000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECLOTURE0z', 1.3, 'v1')$$,
  'P0001', 'Plafond insuffisant : il manque 0,05 $.', 'relance : le plafond porte sur le cumul de tous les lancements');
select is(public.lancer_deliberation('96000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECLOTURE0z', 1.35, 'v2'),
  '{"cle_fin": "RE0z", "lancements": 2}'::jsonb, 'relance : plafond relevé, nouvelle clé, deuxième lancement');
reset role;
select is((select string_agg(statut, ',' order by jure) from public.audit where depot_id = '96000000-0000-4000-8000-0000000000d1'),
  'termine,a_envoyer,a_envoyer,a_envoyer', 'seuls les audits en echec repartent');
-- Deux audits terminent (0,2 $ chacun), le dernier échoue (0,1 $ payé) : dépensé 0,3 + 0,4 + 0,1 = 0,8 $.
update public.audit set statut = 'termine', cout_usd = 0.2 where depot_id = '96000000-0000-4000-8000-0000000000d1' and jure in ('sudo', 'refacto');
update public.audit set statut = 'echec', cout_usd = 0.1 where depot_id = '96000000-0000-4000-8000-0000000000d1' and jure = 'pitch';
set local role service_role;
select is(public.cloturer_deliberation(current_setting('t.x')::uuid), 'deliberation', 'relance 1 : un echec, la campagne reste en délibération');
-- Relance 2 : pire cas 0,35 $ sur le dépensé 0,8 $ ; 1,15 $ suffit pile.
select throws_ok($$select public.lancer_deliberation('96000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECLOTURE0y', 1.14, 'v1')$$,
  'P0001', 'Plafond insuffisant : il manque 0,01 $.', 'relance 2 : plafond sous le cumul : refus');
select is(public.lancer_deliberation('96000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECLOTURE0y', 1.15, 'v1'),
  '{"cle_fin": "RE0y", "lancements": 3}'::jsonb, 'relance 2 : troisième lancement');
reset role;
select is((select string_agg(statut, ',' order by jure) from public.audit where depot_id = '96000000-0000-4000-8000-0000000000d1'),
  'termine,a_envoyer,termine,termine', 'relance 2 : seul l''audit en echec repart');
update public.audit set statut = 'echec' where depot_id = '96000000-0000-4000-8000-0000000000d1' and statut = 'a_envoyer';
set local role service_role;
select is(public.cloturer_deliberation(current_setting('t.x')::uuid), 'deliberation', 'troisième clôture : un echec, en délibération');
select throws_ok($$select public.lancer_deliberation('96000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid, 'sk-ant-api03-FAUSSECLECLOTURE0x', 9, 'v1')$$,
  'P0001', 'Les trois lancements de la délibération sont consommés.', 'troisième lancement consommé : relance refusée');
-- Terminer : refus d'un compte non Boss, d'une campagne hors délibération ; puis la fin.
select throws_ok($$select public.terminer_deliberation('96000000-0000-4000-8000-0000000000b2', current_setting('t.x')::uuid)$$,
  'CT404', 'Campagne introuvable.', 'terminer par un autre Boss : introuvable');
select throws_ok($$select public.terminer_deliberation('96000000-0000-4000-8000-0000000000b8', current_setting('t.r')::uuid)$$,
  'P0001', 'La campagne n''est pas en délibération.', 'terminer une campagne ouverte : refus');
reset role;
update public.compte set etat = 'suspendu' where id = '96000000-0000-4000-8000-0000000000b1';
set local role service_role;
select throws_ok($$select public.terminer_deliberation('96000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid)$$,
  'P0001', 'Ton compte n''est pas actif.', 'terminer par un compte non actif : refus');
reset role;
update public.compte set etat = 'actif' where id = '96000000-0000-4000-8000-0000000000b1';
set local role service_role;
select is(public.terminer_deliberation('96000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid), 'prete', 'terminer : prete');
reset role;
select is((select statut || ':' || coalesce(cle_fin, '-') from public.campagne where id = current_setting('t.x')::uuid), 'prete:-', 'X est prete, sans clé');
select is((select string_agg(statut, ',' order by jure) from public.audit where depot_id = '96000000-0000-4000-8000-0000000000d1'),
  'termine,echec,termine,termine', 'l''audit en echec reste en echec : pas de score pour ce dépôt, jamais noté zéro');
set local role service_role;
select throws_ok($$select public.terminer_deliberation('96000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid)$$,
  'P0001', 'La campagne n''est pas en délibération.', 'terminer une campagne prete : refus');
reset role;

-- Y : tous les audits terminés (le dépôt trop_gros n'en a pas) : la clôture pose prete et efface la clé.
update public.audit set statut = 'termine' where depot_id = '96000000-0000-4000-8000-0000000000d2';
set local role service_role;
select is(public.cloturer_deliberation(current_setting('t.y')::uuid), 'prete', 'tout est terminé hors trop_gros : prete');
reset role;
select is((select statut || ':' || coalesce(cle_fin, '-') from public.campagne where id = current_setting('t.y')::uuid), 'prete:-', 'Y est prete, sans cle_fin');
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.y')), 0::bigint, 'Y : la clé est effacée');

-- W : tout terminé mais la campagne est bloquée : elle reste en délibération, sans clé ; elle ne se termine pas non plus.
update public.audit set statut = 'termine' where depot_id = '96000000-0000-4000-8000-0000000000d3';
update public.campagne set bloquee_le = now(), motif_blocage = 'Test' where id = current_setting('t.w')::uuid;
set local role service_role;
select is(public.cloturer_deliberation(current_setting('t.w')::uuid), 'deliberation', 'campagne bloquée : pas prete');
select throws_ok($$select public.terminer_deliberation('96000000-0000-4000-8000-0000000000b3', current_setting('t.w')::uuid)$$,
  'P0001', 'Cette campagne est bloquée : la délibération ne se termine plus.', 'campagne bloquée : terminer refuse');
reset role;
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.w')), 0::bigint, 'W : la clé est effacée quand même');

-- Sorties de deliberation et suppression : la clé ne survit pas (déclencheurs).
update public.campagne set statut = 'expiree' where id = current_setting('t.v')::uuid;
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.v')), 0::bigint, 'deliberation → expiree : la clé est effacée');
select is((select cle_fin from public.campagne where id = current_setting('t.v')::uuid), null, 'deliberation → expiree : cle_fin remis à null');
select lives_ok($$delete from public.campagne where id = current_setting('t.u')::uuid$$, 'la campagne en délibération se supprime');
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.u')), 0::bigint, 'suppression : la clé est effacée');
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.s')), 1::bigint, 'les autres clés n''ont pas bougé');

-- Hors délibération : la clôture n'écrit que l'effacement de la clé ; campagne inconnue : null, secret effacé.
select vault.create_secret('valeur-factice', 'cle_boss_' || current_setting('t.r'));
select vault.create_secret('valeur-factice', 'cle_boss_96000000-0000-4000-8000-000000000000');
set local role service_role;
select is(public.cloturer_deliberation(current_setting('t.r')::uuid), 'ouverte', 'campagne ouverte : rend son statut');
select is(public.cloturer_deliberation('96000000-0000-4000-8000-000000000000'), null, 'campagne inconnue : null');
reset role;
select is((select count(*) from vault.secrets where name in ('cle_boss_' || current_setting('t.r'), 'cle_boss_96000000-0000-4000-8000-000000000000')),
  0::bigint, 'hors délibération et campagne inconnue : le secret est effacé');
select is((select statut from public.campagne where id = current_setting('t.r')::uuid), 'ouverte', 'la campagne ouverte n''a pas bougé');

-- Cron : R (clé sur une campagne ouverte) est clôturée ; S (clé fraîche, campagne en délibération) et les secrets étrangers restent.
-- L'âge de la clé (48 h) ne se teste pas ici : vault.secrets appartient à supabase_admin, que postgres ne peut pas devenir pour
-- dater une clé ; tests/stack/cloture.test.ts le fait. T : la clôture forcée (le cron, clé de plus de 48 h) abandonne un lot en cours.
select vault.create_secret('valeur-factice', 'cle_boss_' || current_setting('t.r'));
select vault.create_secret('valeur-factice', 'cle_boss_pas-un-identifiant');
select vault.create_secret('valeur-factice', 'autre_secret');
update public.audit set statut = 'en_cours', batch_id = 'lot' where depot_id = '96000000-0000-4000-8000-0000000000d6' and jure = 'sudo';
update public.audit set statut = 'termine' where depot_id = '96000000-0000-4000-8000-0000000000d6' and jure <> 'sudo';
set local role service_role;
select throws_ok($$select public.cloturer_deliberation(current_setting('t.t')::uuid)$$, 'CT409', null, 'T : sans force, le lot en cours bloque');
select is(public.cloturer_cles_expirees(), '{"cles_cloturees": 1, "echecs": 0}'::jsonb, 'le cron clôture la clé d''une campagne ouverte, pas celle de S (clé fraîche, délibération en cours)');
select is(public.cloturer_cles_expirees(), '{"cles_cloturees": 0, "echecs": 0}'::jsonb, 'le cron rejoué : rien à faire');
select is(public.cloturer_deliberation(current_setting('t.t')::uuid, true), 'deliberation', 'T forcée avec une clé de moins de 48 h : sans effet');
reset role;
select is(has_function_privilege('authenticated', 'public.cloturer_cles_expirees()', 'execute'), false, 'le cron n''est pas ouvert à authenticated');
select is((select count(*) from vault.secrets where name in ('autre_secret', 'cle_boss_pas-un-identifiant', 'cle_boss_' || current_setting('t.s'))),
  3::bigint, 'restent : la clé de S et les secrets étrangers');
select is((select count(*) filter (where a.statut = 'echec') || ':' || count(*) filter (where a.statut = 'termine')
  from public.depot d join public.audit a on a.depot_id = d.id where d.id = '96000000-0000-4000-8000-0000000000d6'),
  '0:3', 'T : forcée ou non, le lot en cours reste en cours tant que la clé a moins de 48 h');
select is((select count(*) from vault.secrets where name = 'cle_boss_' || current_setting('t.t')), 1::bigint, 'T : la clé est intacte');
-- Échue (résultats passés), T se termine quand même : la clé est effacée par la clôture non forcée après le relevé du lot.
update public.audit set statut = 'echec' where depot_id = '96000000-0000-4000-8000-0000000000d6' and statut = 'en_cours';
set local role service_role;
select is(public.cloturer_deliberation(current_setting('t.t')::uuid), 'deliberation', 'T : lot relevé, clôture non forcée, clé effacée');
reset role;
update public.campagne set ouverture_inscriptions = now() - interval '9 days', cloture_depot = now() - interval '8 days',
  date_resultats = now() - interval '1 day' where id = current_setting('t.t')::uuid;
set local role service_role;
select is(public.terminer_deliberation('96000000-0000-4000-8000-0000000000b6', current_setting('t.t')::uuid), 'prete', 'campagne échue : terminer passe');
reset role;

select * from finish();
rollback;
