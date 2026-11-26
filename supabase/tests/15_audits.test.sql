-- Audits écrits par prive (story 4.4) : cout_tokens (seule source des tarifs), ecrire_tokens_exacts (trop_gros), marquer_envoye
-- et enregistrer_audit (refus, validation des critères et des notes, coût, reste du plafond), droits (rôle de service seul).
-- Clé factice seulement. Rôles : Boss (B1, B2), candidats (A1 à A3), rôle de service.
begin;
create extension if not exists pgtap with schema extensions;
select plan(116);

insert into auth.users (id, email)
select ('95000000-0000-4000-8000-0000000000' || h)::uuid, h || '@example.org' from unnest(array['a1', 'a2', 'a3', 'b1', 'b2']) h;
insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
select ('95000000-0000-4000-8000-0000000000' || h)::uuid, '95' || h, 'ecrit_' || h, now(), '2026-11-25', now(), 'actif'
from unnest(array['a1', 'a2', 'a3', 'b1', 'b2']) h;
-- X : campagne de B1 (dépôts clos), lancée plus bas ; Y : celle de B2, restée ouverte, avec un audit posé à la main.
insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
  ouverture_inscriptions, cloture_depot, date_resultats)
select s, ('95000000-0000-4000-8000-0000000000' || b)::uuid, 'Titre ' || s, 'Thème', 'Brief', array['Go'], 'publique', 'juge', 10,
  now() - interval '2 days', now() - interval '1 day', now() + interval '5 days'
from (values ('ecritx', 'b1'), ('ecrity', 'b2')) v(s, b);
update public.campagne set statut = 'ouverte' where slug like 'ecrit%';
select set_config('t.' || substr(slug, 6), id::text, true) from public.campagne where slug like 'ecrit%';

-- Dépôts de X : d1 (estimé 50 000, note d'outillage 6), d2 (20 000), d3 (30 000, trop gros au recompte) ; d5 à Y.
insert into public.participation (id, campagne_id, compte_id, connaissance_envoi_le) values
  ('95000000-0000-4000-8000-0000000000f1', current_setting('t.x')::uuid, '95000000-0000-4000-8000-0000000000a1', now()),
  ('95000000-0000-4000-8000-0000000000f2', current_setting('t.x')::uuid, '95000000-0000-4000-8000-0000000000a2', now()),
  ('95000000-0000-4000-8000-0000000000f3', current_setting('t.x')::uuid, '95000000-0000-4000-8000-0000000000a3', now()),
  ('95000000-0000-4000-8000-0000000000f5', current_setting('t.y')::uuid, '95000000-0000-4000-8000-0000000000a1', now());
insert into public.depot (id, participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, note_outillage, presentation,
  droit_declare_le)
select ('95000000-0000-4000-8000-0000000000d' || n)::uuid, ('95000000-0000-4000-8000-0000000000f' || n)::uuid,
  gen_random_uuid() || '/' || gen_random_uuid() || '/' || gen_random_uuid() || '.zip', repeat('a', 64), 1, e, 6, 'Présentation', now()
from (values (1, 50000), (2, 20000), (3, 30000), (5, 100000)) v(n, e);
insert into public.audit (depot_id, jure) values ('95000000-0000-4000-8000-0000000000d5', 'sudo');
select set_config('t.y_sudo', id::text, true) from public.audit where depot_id = '95000000-0000-4000-8000-0000000000d5';

-- Droits.
select is_empty($$
  select f, r from unnest(array['public.ecrire_tokens_exacts(uuid, integer)', 'public.marquer_envoye(uuid[], text)',
    'public.enregistrer_audit(uuid, text, jsonb, jsonb)', 'public.cout_tokens(numeric, numeric, numeric, numeric, boolean)']) f,
    unnest(array['anon', 'authenticated']) r where has_function_privilege(r, f, 'execute')
$$, 'anon et authenticated n''exécutent aucune des quatre fonctions');
select is_empty($$
  select 1 from information_schema.routine_privileges
  where routine_name in ('ecrire_tokens_exacts', 'marquer_envoye', 'enregistrer_audit', 'cout_tokens') and grantee = 'PUBLIC'
$$, 'PUBLIC n''exécute aucune des quatre fonctions');
select is_empty($$
  select f from unnest(array['public.ecrire_tokens_exacts(uuid, integer)', 'public.marquer_envoye(uuid[], text)',
    'public.enregistrer_audit(uuid, text, jsonb, jsonb)']) f where not has_function_privilege('service_role', f, 'execute')
$$, 'le rôle de service exécute les trois fonctions de prive');
select is(has_function_privilege('service_role', 'public.cout_tokens(numeric, numeric, numeric, numeric, boolean)', 'execute'), false,
  'cout_tokens : pas même le rôle de service');
-- Test de forme : la clause de verrou de chaque fonction, sur la ligne campagne de l'objet reçu.
select is_empty($$
  select f from (values
    ('public.ecrire_tokens_exacts(uuid, integer)'::regprocedure, 'where d\.id = p_depot for update of c;'),
    ('public.marquer_envoye(uuid[], text)'::regprocedure, 'where a\.id = any\(p_audits\) order by c\.id for update of c;'),
    ('public.enregistrer_audit(uuid, text, jsonb, jsonb)'::regprocedure, 'where a\.id = p_audit for update of c;')) v(f, clause)
  where pg_get_functiondef(f) !~ clause
$$, 'chaque fonction verrouille la ligne campagne de son objet (for update of c)');
select is(has_table_privilege('service_role', 'public.audit', 'insert,update,delete,truncate,references,trigger'), false,
  'audit : toujours aucune écriture directe du rôle de service');
select is(has_any_column_privilege('service_role', 'public.depot', 'insert,update,references'), false,
  'depot : aucune écriture directe du rôle de service');
select is_empty($$
  select t, c from (values ('public.depot', 'chemin_stockage'), ('public.depot', 'presentation'), ('public.depot', 'note_outillage'),
    ('public.depot', 'alertes_integrite'), ('public.campagne', 'boss_id'), ('public.campagne', 'jeton_invitation'),
    ('public.campagne', 'cle_fin')) v(t, c)
  where has_column_privilege('service_role', t, c, 'select')
$$, 'le rôle de service ne lit ni le chemin du zip, ni la présentation, ni les alertes, ni le Boss, ni le jeton, ni cle_fin');
select is_empty($$
  select t, c from (values ('public.depot', 'chemin_filtre'), ('public.depot', 'faits'), ('public.depot', 'nb_tokens_exact'),
    ('public.depot', 'trop_gros'), ('public.depot', 'participation_id'), ('public.campagne', 'brief'),
    ('public.campagne', 'plafond_usd')) v(t, c)
  where not has_column_privilege('service_role', t, c, 'select')
$$, 'le rôle de service lit ce que prive envoie au jury : archive filtrée, faits, compte exact, brief, plafond');

set local role anon;
select throws_ok($$select public.enregistrer_audit(current_setting('t.y_sudo')::uuid, 'echec', null, null)$$, '42501', null,
  'le visiteur n''enregistre pas d''audit');
select throws_ok($$select public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d1', 1)$$, '42501', null,
  'le visiteur n''écrit pas de tokens');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"95000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.enregistrer_audit(current_setting('t.y_sudo')::uuid, 'echec', null, null)$$, '42501', null,
  'le Boss n''enregistre pas d''audit');
select throws_ok($$select public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d1', 1)$$, '42501', null,
  'le Boss n''écrit pas de tokens');
select throws_ok($$select public.marquer_envoye(array[current_setting('t.y_sudo')::uuid], 'lot')$$, '42501', null,
  'le Boss ne marque pas d''envoi');
select throws_ok($$select public.cout_tokens(1, 1, 1, 1, true)$$, '42501', null, 'le Boss n''appelle pas cout_tokens');
reset role;

-- cout_tokens (postgres) : tarifs d'Opus 5.5 par million, moitié prix en lot.
select is(public.cout_tokens(1000000, 0, 0, 0, false), 4::numeric, 'entrée : 4 $ le million');
select is(public.cout_tokens(0, 1000000, 0, 0, false), 20::numeric, 'sortie : 20 $ le million');
select is(public.cout_tokens(0, 0, 1000000, 0, false), 8::numeric, 'écriture de cache (1 h) : 8 $ le million');
select is(public.cout_tokens(0, 0, 0, 1000000, false), 0.4::numeric, 'lecture de cache : 0,40 $ le million');
select is(public.cout_tokens(1000000, 1000000, 1000000, 1000000, true), 16.2::numeric, 'lot : moitié prix');

-- Lancement de X : 4 jurés × (0,35 + 0,23 + 0,27 $) = 3,40 $ de pire cas, plafond 10 $.
set local role service_role;
select is(public.estimer_pire_cas(current_setting('t.x')::uuid), 3.4::numeric, 'estimer_pire_cas passe par cout_tokens : même montant');
select lives_ok($$select public.lancer_deliberation('95000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid,
  'sk-ant-FAUSSE-aaaaaaaaaaaaaaaaaaaa', 10, 'v1')$$, 'lancement de X');
reset role;
select set_config('t.' || right(depot_id::text, 2) || '_' || jure, id::text, true) from public.audit;
set local role service_role;
select is(public.marquer_envoye(array[current_setting('t.d1_lint')::uuid], 'lot_0'), 0, 'dépôt pas encore recompté : audit ignoré');
reset role;

-- ecrire_tokens_exacts : refus.
set local role service_role;
select throws_ok($$select public.ecrire_tokens_exacts('95000000-0000-4000-8000-000000000000', 1)$$, 'CT404', 'Dépôt introuvable.',
  'dépôt inconnu : refus');
select throws_ok($$select public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d5', 1)$$, 'CT409',
  'La campagne n''est pas en délibération.', 'campagne ouverte : refus');
select throws_ok($$select public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d1', -1)$$, 'P0001', 'Nombre de tokens refusé.',
  'nombre négatif : refus');
select throws_ok($$select public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d1', null)$$, 'P0001', 'Nombre de tokens refusé.',
  'nombre absent : refus');

-- Écriture, borne de 100 000 et trop_gros. d3 sudo part d'abord dans un lot : seul l'a_envoyer passe en echec.
select is(public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d1', 50000), false, 'd1, 50 000 : pas trop gros');
select is(public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d2', 100000), false, 'd2, 100 000 pile : pas trop gros');
select is(public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d3', 30000), false, 'd3, premier compte : 30 000');
select is(public.marquer_envoye(array[current_setting('t.d3_sudo')::uuid], 'lot_0'), 1, 'd3 sudo part dans un lot');
select is(public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d3', 100001), true, 'd3, 100 001 : trop gros');
reset role;
select is((select nb_tokens_exact || ':' || trop_gros from public.depot where id = '95000000-0000-4000-8000-0000000000d1'), '50000:false',
  'd1 : compte exact écrit');
select is((select nb_tokens_exact || ':' || trop_gros from public.depot where id = '95000000-0000-4000-8000-0000000000d3'), '100001:true',
  'd3 : compte exact écrit, trop_gros');
select is((select string_agg(jure || ':' || statut, ' ' order by jure) from public.audit where depot_id = '95000000-0000-4000-8000-0000000000d3'),
  'lint:echec pitch:echec refacto:echec sudo:en_cours', 'd3 : ses audits a_envoyer passent en echec, pas celui déjà en lot');
set local role service_role;
select is(public.ecrire_tokens_exacts('95000000-0000-4000-8000-0000000000d3', 10), true, 'un recompte plus petit ne retire pas trop_gros');
select is(public.estimer_pire_cas(current_setting('t.x')::uuid), 3.6::numeric, 'le pire cas exclut d3 et prend les comptes exacts : 4 × (0,35 + 0,55 $)');
reset role;

-- marquer_envoye.
set local role service_role;
select throws_ok($$select public.marquer_envoye(array[current_setting('t.d1_sudo')::uuid], '')$$, 'P0001', 'Identifiant de lot refusé.',
  'lot vide : refus');
select throws_ok($$select public.marquer_envoye(array[current_setting('t.d1_sudo')::uuid], null)$$, 'P0001', 'Identifiant de lot refusé.',
  'lot absent : refus');
select throws_ok($$select public.marquer_envoye(array[current_setting('t.d1_sudo')::uuid], repeat('l', 201))$$, 'P0001',
  'Identifiant de lot refusé.', 'lot de 201 caractères : refus');
select is(public.marquer_envoye(array[current_setting('t.d1_sudo')::uuid, current_setting('t.d1_refacto')::uuid,
  current_setting('t.y_sudo')::uuid, current_setting('t.d3_lint')::uuid, '95000000-0000-4000-8000-000000000000'], repeat('l', 200)), 2,
  'deux audits a_envoyer passent en_cours ; ceux d''une campagne ouverte, en echec ou inconnus sont ignorés');
select is(public.marquer_envoye(array[current_setting('t.d1_sudo')::uuid], 'lot_2'), 0, 'un audit déjà en_cours n''est pas remarqué');
select is(public.marquer_envoye(null, 'lot_2'), 0, 'aucun audit : rien');
reset role;
select is((select statut || ':' || batch_id from public.audit where id = current_setting('t.d1_sudo')::uuid), 'en_cours:' || repeat('l', 200),
  'd1 sudo : en_cours avec son lot');
select is((select statut || ':' || coalesce(batch_id, '-') from public.audit where id = current_setting('t.y_sudo')::uuid), 'a_envoyer:-',
  'l''audit de la campagne ouverte n''a pas bougé');
select is((select statut from public.audit where id = current_setting('t.d3_lint')::uuid), 'echec', 'l''audit en echec n''a pas bougé');

-- enregistrer_audit : un résultat valide de sudo, que chaque refus abîme d'un seul point.
select set_config('t.ok', $j${"modele": "claude-opus-5-5", "version_consignes": "2026-11-26", "criteres": [
  {"cle": "securite", "note": 7, "justification": "Requêtes préparées.", "preuves": [{"fichier": "a.go", "ligne": 3, "constat": "c"}]},
  {"cle": "erreurs_cas_limites", "note": 0, "justification": "Rien.", "preuves": [{"fichier": "b.go", "ligne": 1, "constat": "c"}]}],
  "points_forts": [], "a_ameliorer": [], "manipulation_detectee": {"detectee": false, "preuves": []},
  "verdict": "convaincu", "replique": "Solide."}$j$, true);
create function pg_temp.essai(p_resultat jsonb, p_usage jsonb default null) returns numeric language sql as $f$
  select public.enregistrer_audit(current_setting('t.d1_sudo')::uuid, 'termine', p_resultat, p_usage)
$f$;
grant execute on function pg_temp.essai(jsonb, jsonb) to service_role;
set local role service_role;
select throws_ok($$select public.enregistrer_audit('95000000-0000-4000-8000-000000000000', 'termine', current_setting('t.ok')::jsonb, null)$$,
  'CT404', 'Audit introuvable.', 'audit inconnu : refus');
select throws_ok($$select public.enregistrer_audit(current_setting('t.y_sudo')::uuid, 'echec', null, null)$$,
  'CT409', 'La campagne n''est pas en délibération.', 'hors délibération : refus');
select throws_ok($$select public.enregistrer_audit(current_setting('t.d1_sudo')::uuid, 'en_cours', null, null)$$,
  'P0001', 'Statut refusé.', 'statut en_cours : refus');
select throws_ok($$select public.enregistrer_audit(current_setting('t.d1_sudo')::uuid, null, null, null)$$,
  'P0001', 'Statut refusé.', 'statut absent : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb, '{"lot": true}')$$, 'P0001', 'Usage mal formé.', 'usage objet : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb, '[{"input_tokens": 5}]')$$, 'P0001', 'Usage mal formé.', 'usage sans lot : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb, '[{"lot": "true", "input_tokens": 5}]')$$, 'P0001', 'Usage mal formé.',
  'lot non booléen : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb, '[{"lot": true, "input_tokens": -1}]')$$, 'P0001', 'Usage mal formé.',
  'tokens négatifs : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb, '[{"lot": true, "output_tokens": 1.5}]')$$, 'P0001', 'Usage mal formé.',
  'tokens non entiers : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb, '[{"lot": true, "output_tokens": "5"}]')$$, 'P0001', 'Usage mal formé.',
  'tokens en texte : refus');
select throws_ok($$select pg_temp.essai(null)$$, 'P0001', 'Résultat mal formé.', 'termine sans résultat : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb - 'modele')$$, 'P0001', 'Résultat mal formé.', 'sans modèle : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb || jsonb_build_object('version_consignes', repeat('v', 81)))$$,
  'P0001', 'Résultat mal formé.', 'version des consignes de 81 caractères : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb || jsonb_build_object('modele', E' \t\u00a0'))$$,
  'P0001', 'Résultat mal formé.', 'modèle fait de blancs seuls : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb || '{"version_consignes": "   "}')$$,
  'P0001', 'Résultat mal formé.', 'version des consignes faite de blancs seuls : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb || '{"verdict": "peut_etre"}')$$, 'P0001', 'Résultat mal formé.',
  'verdict hors liste : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb || '{"verdict": 1}')$$, 'P0001', 'Résultat mal formé.',
  'verdict non texte : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb - 'replique')$$, 'P0001', 'Résultat mal formé.', 'sans réplique : refus');
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb || '{"criteres": {}}')$$, 'P0001', 'Résultat mal formé.',
  'criteres hors tableau : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres}', (current_setting('t.ok')::jsonb -> 'criteres') - 1))$$,
  'P0001', 'Critères du juré refusés.', 'critère manquant : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,1,cle}', '"tests"'))$$,
  'P0001', 'Critères du juré refusés.', 'critère d''un autre juré : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,1,cle}', '"securite"'))$$,
  'P0001', 'Critères du juré refusés.', 'critère en double : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres}',
  (current_setting('t.ok')::jsonb -> 'criteres') || '[{"cle": "inconnu", "note": 5, "preuves": [{"fichier": "a", "ligne": 1, "constat": "c"}]}]'))$$,
  'P0001', 'Critères du juré refusés.', 'critère inconnu en plus : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,note}', '7.5'))$$,
  'P0001', 'Note refusée : un entier de 0 à 10.', 'note 7,5 : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,note}', '"7"'))$$,
  'P0001', 'Note refusée : un entier de 0 à 10.', 'note en texte : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,note}', 'null'))$$,
  'P0001', 'Note refusée : un entier de 0 à 10.', 'note nulle : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,note}', '11'))$$,
  'P0001', 'Note refusée : un entier de 0 à 10.', 'note 11 : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,note}', '-1'))$$,
  'P0001', 'Note refusée : un entier de 0 à 10.', 'note -1 : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves}', '[]'))$$,
  'P0001', 'Note sans preuve.', 'aucune preuve : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,1}', (current_setting('t.ok')::jsonb #> '{criteres,1}') - 'preuves'))$$,
  'P0001', 'Note sans preuve.', 'preuves absentes : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves,0}', '{"ligne": 3, "constat": "c"}'))$$,
  'P0001', 'Note sans preuve.', 'preuve sans fichier : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves,0,fichier}', '3'))$$,
  'P0001', 'Note sans preuve.', 'fichier non texte : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves,0,fichier}', '" \t "'))$$,
  'P0001', 'Note sans preuve.', 'fichier fait de blancs : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves,0}', '{"fichier": "a.go", "ligne": 3}'))$$,
  'P0001', 'Note sans preuve.', 'preuve sans constat : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves,0,constat}', '""'))$$,
  'P0001', 'Note sans preuve.', 'constat vide : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves,0,ligne}', '-3'))$$,
  'P0001', 'Note sans preuve.', 'ligne -3 : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves,0,ligne}', '1.5'))$$,
  'P0001', 'Note sans preuve.', 'ligne 1,5 : refus');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves}', '"a.go:3"'))$$,
  'P0001', 'Note sans preuve.', 'preuves en chaîne : refus, pas 22023');
select throws_ok($$select pg_temp.essai(jsonb_set(current_setting('t.ok')::jsonb, '{criteres,0,preuves}', '{"fichier": "a.go", "ligne": 3, "constat": "c"}'))$$,
  'P0001', 'Note sans preuve.', 'preuves en objet : refus, pas 22023');
reset role;
select is((select statut || ':' || coalesce(cout_usd::text, '-') || ':' || tentatives || ':' || coalesce(resultat::text, '-')
  from public.audit where id = current_setting('t.d1_sudo')::uuid), 'en_cours:-:0:-', 'les refus n''ont rien écrit');

-- termine : coût d'une tentative en lot, (4 + 2 + 4 + 0,40) / 2 = 5,20 $ ; reste 10 - 5,20 = 4,80 $.
set local role service_role;
select is(pg_temp.essai(current_setting('t.ok')::jsonb, '[{"lot": true, "input_tokens": 1000000, "output_tokens": 100000,
  "cache_creation_input_tokens": 500000, "cache_read_input_tokens": 1000000, "service_tier": "batch"}]'), 4.8::numeric,
  'termine : rend le reste du plafond');
reset role;
select is((select statut || ':' || modele || ':' || version_consignes || ':' || trim_scale(cout_usd) || ':' || tentatives || ':' || jsonb_array_length(usage)
  from public.audit where id = current_setting('t.d1_sudo')::uuid), 'termine:claude-opus-5-5:2026-11-26:5.2:1:1',
  'termine : statut, modèle, version des consignes, coût, tentatives et usage écrits');
select is((select resultat from public.audit where id = current_setting('t.d1_sudo')::uuid),
  current_setting('t.ok')::jsonb - 'modele' - 'version_consignes', 'resultat : la sortie du juré, sans modèle ni version');
set local role service_role;
select throws_ok($$select pg_temp.essai(current_setting('t.ok')::jsonb)$$, 'CT409', 'Audit déjà terminé.', 'audit déjà terminé : refus');

-- lint : seul tests est demandé ; une note sur outillage_doc (calcule) est refusée, la note du scan ne bouge pas.
select throws_ok($$select public.enregistrer_audit(current_setting('t.d1_lint')::uuid, 'termine', current_setting('t.ok')::jsonb
  || '{"criteres": [{"cle": "tests", "note": 4, "preuves": [{"fichier": "t.go", "ligne": 1, "constat": "c"}]},
  {"cle": "outillage_doc", "note": 9, "preuves": [{"fichier": "README.md", "ligne": 1, "constat": "c"}]}]}', null)$$,
  'P0001', 'Critères du juré refusés.', 'note sur un critère calcule : refus');
select is(public.enregistrer_audit(current_setting('t.d1_lint')::uuid, 'termine', current_setting('t.ok')::jsonb
  || '{"criteres": [{"cle": "tests", "note": 4, "preuves": [{"fichier": "t.go", "ligne": 1, "constat": "c"}]}]}'
  || jsonb_build_object('modele', ' ' || repeat('m', 80) || E'\n', 'version_consignes', E'\t2026-11-26 '), '[]'), 4.8::numeric,
  'lint sans outillage_doc : accepté, sans coût (modèle de 80 caractères entouré de blancs)');
reset role;
select is((select modele || ':' || version_consignes from public.audit where id = current_setting('t.d1_lint')::uuid),
  repeat('m', 80) || ':2026-11-26', 'modèle et version des consignes rangés rognés');
select is((select note_outillage from public.depot where id = '95000000-0000-4000-8000-0000000000d1'), 6, 'la note d''outillage reste celle du scan');
select is((select cout_usd || ':' || tentatives || ':' || coalesce(usage::text, '-') from public.audit where id = current_setting('t.d1_lint')::uuid),
  '0:0:-', 'usage vide : coût nul, aucune tentative');

-- echec : deux tentatives, une en lot (4 / 2 = 2 $) et une en direct (50 000 × 20 $ = 1 $) ; le résultat est ignoré.
set local role service_role;
select is(public.enregistrer_audit(current_setting('t.d1_refacto')::uuid, 'echec', current_setting('t.ok')::jsonb,
  '[{"lot": true, "input_tokens": 1000000}, {"lot": false, "output_tokens": 50000}]'), 1.8::numeric, 'echec : coût compté, reste 1,80 $');
select is(public.enregistrer_audit(current_setting('t.d1_refacto')::uuid, 'echec', null, null), 1.8::numeric,
  'echec sans appel : rien de plus');
-- Pas d'idempotence (comportement figé) : un echec rejoué ajoute de nouveau son usage, son coût et ses tentatives.
select is(public.enregistrer_audit(current_setting('t.d1_refacto')::uuid, 'echec', null, '[{"lot": false, "output_tokens": 50000}]'),
  0.8::numeric, 'echec avec usage : 1 $ de plus');
select is(public.enregistrer_audit(current_setting('t.d1_refacto')::uuid, 'echec', null, '[{"lot": false, "output_tokens": 50000}]'),
  -0.2::numeric, 'le même echec rejoué compte une seconde fois');
select is(public.enregistrer_audit(current_setting('t.d2_pitch')::uuid, 'echec', null, null), -0.2::numeric,
  'un audit a_envoyer passe en echec sans appel (plafond épuisé)');
reset role;
select is((select statut || ':' || coalesce(resultat::text, '-') || ':' || coalesce(modele, '-') || ':' || trim_scale(cout_usd) || ':' || tentatives
  || ':' || jsonb_array_length(usage) from public.audit where id = current_setting('t.d1_refacto')::uuid), 'echec:-:-:5:4:4',
  'echec : ni résultat ni modèle, coût et tentatives cumulés, rejeu compris');
select is((select statut || ':' || cout_usd || ':' || tentatives from public.audit where id = current_setting('t.d2_pitch')::uuid), 'echec:0:0',
  'echec sans appel : coût nul');

-- Relance de l'audit en echec : le nouveau coût s'ajoute à celui déjà payé.
update public.audit set statut = 'a_envoyer' where id = current_setting('t.d1_refacto')::uuid;
set local role service_role;
select is(public.enregistrer_audit(current_setting('t.d1_refacto')::uuid, 'termine', current_setting('t.ok')::jsonb
  || '{"criteres": [{"cle": "structure_decoupage", "note": 10, "preuves": [{"fichier": "a", "ligne": 1, "constat": "c"}]},
  {"cle": "lisibilite_nommage", "note": 5, "preuves": [{"fichier": "a", "ligne": 2, "constat": "c"}]}]}',
  '[{"lot": false, "output_tokens": 50000}]'), -1.2::numeric, 'relance terminée : reste -1,20 $');
reset role;
select is((select statut || ':' || trim_scale(cout_usd) || ':' || tentatives || ':' || jsonb_array_length(usage) from public.audit
  where id = current_setting('t.d1_refacto')::uuid), 'termine:6:5:5', 'le coût de la relance s''ajoute à celui déjà payé');
set local role service_role;
select is(public.depense_audits(current_setting('t.x')::uuid), 11.2::numeric, 'depense_audits voit la somme des coûts');
reset role;

-- termine est refusé pour l'audit d'un dépôt trop_gros, même en_cours.
set local role service_role;
select throws_ok($$select public.enregistrer_audit(current_setting('t.d3_sudo')::uuid, 'termine', current_setting('t.ok')::jsonb, null)$$,
  'CT409', 'Dépôt trop gros : l''audit ne se termine pas.', 'dépôt trop_gros : termine refusé');
reset role;

-- Un echec avec usage (coût nul), pour vérifier que la relance garde l'usage déjà payé.
set local role service_role;
select is(public.enregistrer_audit(current_setting('t.d2_sudo')::uuid, 'echec', null, '[{"lot": true, "output_tokens": 0}]'), -1.2::numeric,
  'd2 sudo en echec avec une tentative');
reset role;

-- Une relance de la délibération ne recrée ni ne relance aucun audit d'un dépôt trop_gros.
delete from public.audit where id = current_setting('t.d3_pitch')::uuid;
set local role service_role;
select lives_ok($$select public.effacer_cle_boss(current_setting('t.x')::uuid)$$, 'fin du premier lancement');
select lives_ok($$select public.lancer_deliberation('95000000-0000-4000-8000-0000000000b1', current_setting('t.x')::uuid,
  'sk-ant-FAUSSE-bbbbbbbbbbbbbbbbbbbb', 100, 'v1')$$, 'relance de X');
reset role;
select is((select string_agg(jure || ':' || statut, ' ' order by jure) from public.audit where depot_id = '95000000-0000-4000-8000-0000000000d3'),
  'lint:echec refacto:echec sudo:en_cours', 'd3 trop_gros : aucun audit recréé ni relancé');
select is((select statut from public.audit where id = current_setting('t.d2_pitch')::uuid), 'a_envoyer', 'un autre audit en echec, lui, repart');
select is((select statut || ':' || jsonb_array_length(usage) from public.audit where id = current_setting('t.d2_sudo')::uuid), 'a_envoyer:1',
  'la relance garde l''usage déjà payé');
set local role service_role;
select lives_ok($$select public.enregistrer_audit(current_setting('t.d2_sudo')::uuid, 'echec', null, '[{"lot": false, "output_tokens": 0}]')$$,
  'nouvel enregistrement après la relance');
reset role;
select is((select jsonb_array_length(usage) || ':' || tentatives || ':' || (usage -> 0 ->> 'lot') from public.audit
  where id = current_setting('t.d2_sudo')::uuid), '2:2:true', 'l''usage d''avant la relance est conservé, le nouveau s''y ajoute');

-- Une clé d'usage à null (l'API en renvoie) compte pour 0 : 10 tokens d'entrée en lot = 10 × 4 / 1 M / 2 = 0,00002 $.
set local role service_role;
select lives_ok($$select public.enregistrer_audit(current_setting('t.d2_lint')::uuid, 'echec', null,
  '[{"lot": true, "input_tokens": 10, "cache_read_input_tokens": null}]')$$, 'usage avec une clé à null : accepté');
reset role;
select is((select trim_scale(cout_usd) || ':' || tentatives from public.audit where id = current_setting('t.d2_lint')::uuid), '0.00002:1',
  'la clé à null compte pour 0 : coût attendu');

delete from vault.secrets where name like 'cle_boss_%';
select * from finish();
rollback;
