-- Données d'exemple FICTIVES, pour la base locale et les tests pgTAP.
-- Ne jamais appliquer ce fichier à préprod ni à prod : il crée un compte organisateur.
-- Aucun identifiant GitHub réel : les github_id commencent par « fictif- », les adresses
-- sont en .invalid.
--
-- Identifiants : comptes 10000000-…-00000000NN, campagnes 20000000-…, participations 30000000-…
-- Comptes : 01 organisateur ; 0a alice, 0b bob, 0c chloe, 0d dan, 0e eve, 0f frank (autorisés) ;
-- a1 victor (verifie), a2 wendy (liste_attente), a3 rita (refuse), a4 felix (ferme),
-- a5 gus (email_a_verifier) ; d1 ada, d2 grace, d3 linus, d4 margaret, d5 alan, d6 edsger (autorisés, seed-resultats).

create temp table seed_comptes (n text, pseudo text, etat public.compte_etat, role public.compte_role) on commit drop;
insert into seed_comptes values
  ('01', 'seed_organisateur', 'autorise', 'organisateur'),
  ('0a', 'seed_alice', 'autorise', 'candidat'), ('0b', 'seed_bob', 'autorise', 'candidat'),
  ('0c', 'seed_chloe', 'autorise', 'candidat'), ('0d', 'seed_dan', 'autorise', 'candidat'),
  ('0e', 'seed_eve', 'autorise', 'candidat'), ('0f', 'seed_frank', 'autorise', 'candidat'),
  ('a1', 'seed_victor', 'verifie', 'candidat'), ('a2', 'seed_wendy', 'liste_attente', 'candidat'),
  ('a3', 'seed_rita', 'refuse', 'candidat'), ('a4', 'seed_felix', 'ferme', 'candidat'),
  ('a5', 'seed_gus', 'email_a_verifier', 'candidat'),
  ('d1', 'seed_ada', 'autorise', 'candidat'), ('d2', 'seed_grace', 'autorise', 'candidat'),
  ('d3', 'seed_linus', 'autorise', 'candidat'), ('d4', 'seed_margaret', 'autorise', 'candidat'),
  ('d5', 'seed_alan', 'autorise', 'candidat'), ('d6', 'seed_edsger', 'autorise', 'candidat');

insert into auth.users (id, aud, role, email)
select ('10000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated',
       pseudo || '@example.invalid'
from seed_comptes;

insert into public.compte (
  id, github_id, github_donnees, vrai_nom, pseudo, email_contact, email_verifie_le, motivation,
  depot_cite_url, majeur_declare_le, charte_acceptee_le, version_charte, etat, role
)
select ('10000000-0000-4000-8000-0000000000' || n)::uuid, 'fictif-' || n,
       '{"age_compte_jours": 1000, "depots_publics": 12, "activite_recente": true}',
       'Prénom Fictif ' || pseudo, pseudo, pseudo || '@example.invalid',
       case when etat = 'email_a_verifier' then null else now() end,
       'Motivation fictive de ' || pseudo || '.', 'https://example.invalid/' || pseudo,
       now(), now(), '2026-11-22', etat, role
from seed_comptes;

-- Critères par défaut du § 5 (total 100 ; « outillage » est calculé par script).
create temp table seed_criteres (c jsonb) on commit drop;
insert into seed_criteres values ('[
  {"cle": "securite", "libelle": "Sécurité", "poids": 15, "jure": "sudo"},
  {"cle": "erreurs", "libelle": "Gestion des erreurs et cas limites", "poids": 10, "jure": "sudo"},
  {"cle": "structure", "libelle": "Structure et découpage", "poids": 15, "jure": "refacto"},
  {"cle": "lisibilite", "libelle": "Lisibilité et nommage", "poids": 10, "jure": "refacto"},
  {"cle": "tests", "libelle": "Tests", "poids": 15, "jure": "lint"},
  {"cle": "outillage", "libelle": "Outillage et doc", "poids": 10, "jure": "lint", "calcule": true},
  {"cle": "brief", "libelle": "Réponse au brief", "poids": 15, "jure": "pitch"},
  {"cle": "finition", "libelle": "Originalité et finition", "poids": 10, "jure": "pitch"}
]');

-- Campagnes créées en brouillon, puis avancées (les déclencheurs contrôlent l'ordre) : le
-- premier dépôt fige les règles de seed-deliberation et seed-publiee.
insert into public.campagne (id, slug, titre, theme, brief, criteres, ouverture_inscriptions, cloture_depot, date_resultats, max_participants)
select ('20000000-0000-4000-8000-0000000000' || v.n)::uuid, v.slug, 'Campagne fictive ' || v.slug,
       'Thème fictif', 'Brief fictif.', c.c, '2026-12-01', '2026-12-15', '2026-12-31', v.max
from seed_criteres c, (values ('01', 'seed-brouillon', 5), ('02', 'seed-ouverte', 3),
                              ('03', 'seed-deliberation', 5), ('04', 'seed-publiee', 10)) v(n, slug, max);

-- seed-deliberation : alice et bob ont un dépôt et des audits ; le vote d'alice est un brouillon.
-- seed-publiee : l'exemple du § 7 (alice 80 / Boss 4, bob 70 / Boss 9), plus les cas limites.
-- Participations : 3a, 3b (délibération) ; 4a alice, 4b bob, 4c chloe disqualifiée, 4d compte
-- supprimé, 4e dan sans dépôt, 4f frank (audit pitch manquant), 40 eve (vote non verrouillé).
insert into public.participation (id, campagne_id, compte_id)
select ('30000000-0000-4000-8000-0000000000' || v.n)::uuid, ('20000000-0000-4000-8000-0000000000' || v.k)::uuid,
       ('10000000-0000-4000-8000-0000000000' || v.compte)::uuid
from (values ('3a', '03', '0a'), ('3b', '03', '0b'), ('4a', '04', '0a'), ('4b', '04', '0b'),
             ('4c', '04', '0c'), ('4d', '04', null), ('4e', '04', '0d'), ('4f', '04', '0f'),
             ('40', '04', '0e')) v(n, k, compte);

-- Note de chaque participation avec dépôt : tous les critères, outillage compris, reçoivent cette note.
create temp table seed_notes (n text, note integer) on commit drop;
insert into seed_notes values ('3a', 6), ('3b', 6), ('4a', 8), ('4b', 7), ('4c', 9), ('4d', 5), ('4f', 7), ('40', 6);

insert into public.depot (
  participation_id, sha256, taille_octets, nb_fichiers, nb_tokens, presentation, type_code,
  licence_presente, declaration_code_le, alerte_manipulation, note_outillage
)
select p.id, encode(sha256(convert_to(p.id::text, 'UTF8')), 'hex'), 1000, 10, 1000,
       'Présentation fictive.', 'open_source', true, now(), s.n = '4c', s.note
from seed_notes s join public.participation p on p.id = ('30000000-0000-4000-8000-0000000000' || s.n)::uuid;

-- Quatre audits par dépôt, sauf le pitch de frank (4f), qui manque.
insert into public.audit (depot_id, jure, modele, version_consignes, statut, resultat, usage, cout_usd)
select d.id, j.jure, 'modele-fictif', 'consignes-fictives', 'termine',
       jsonb_build_object(
         'criteres', (
           select jsonb_agg(jsonb_build_object('cle', k ->> 'cle', 'note', s.note, 'justification', 'Fictive.', 'preuves', '[]'::jsonb))
           from public.campagne c, jsonb_array_elements(c.criteres) k
           where c.id = p.campagne_id and k ->> 'jure' = j.jure and not coalesce((k ->> 'calcule')::boolean, false)
         ),
         'replique', 'Réplique fictive de ' || j.jure || '.', 'verdict', 'convaincu'
       ),
       '{}', 0
from public.depot d
join public.participation p on p.id = d.participation_id
join seed_notes s on ('30000000-0000-4000-8000-0000000000' || s.n)::uuid = p.id
cross join (values ('sudo'), ('refacto'), ('lint'), ('pitch')) j(jure)
where not (s.n = '4f' and j.jure = 'pitch');

-- Votes du Boss : tous verrouillés sauf celui d'alice en délibération (3a, brouillon).
insert into public.vote_boss (participation_id, note, verrouille_le)
select ('30000000-0000-4000-8000-0000000000' || v.n)::uuid, v.note,
       case when v.n = '3a' then null else now() end
from (values ('3a', 5), ('4a', 4), ('4b', 9), ('4c', 9), ('4d', 5), ('4f', 7), ('40', 5)) v(n, note);

insert into public.decision (campagne_id, participation_id, type, justification)
values ('20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-00000000004c', 'disqualification',
        'Tentative de manipulation du jury confirmée (donnée fictive).');

-- Les campagnes avancent dans l'ordre : brouillon est laissée telle quelle ; seed-ouverte est ouverte ;
-- seed-deliberation et seed-publiee parcourent tout le cycle.
update public.campagne set statut = 'inscriptions' where slug in ('seed-ouverte', 'seed-deliberation', 'seed-publiee');
update public.campagne set statut = 'depot' where slug in ('seed-deliberation', 'seed-publiee');
update public.campagne set statut = 'deliberation' where slug in ('seed-deliberation', 'seed-publiee');
update public.campagne set statut = 'prete' where slug = 'seed-publiee';
update public.campagne set statut = 'publiee' where slug = 'seed-publiee';

-- seed-resultats : une campagne publiée complète, pour la démonstration et les tests des pages de résultats.
-- Cinq classés (podium) : ada 80 / Boss 8 ; margaret et alan à égalité (70 / 7), margaret départagée ; grace 60 / 8 ;
-- edsger 50 / 6. linus est disqualifié (un juré a relevé un passage adressé au jury). La réplique de Sudo pour alan est masquée.
-- Participations : 5a ada, 5b grace, 5c linus, 5d margaret, 5e alan, 5f edsger. Comptes distincts de ceux des autres campagnes :
-- les tests pgTAP des autres campagnes ne les voient pas.
insert into public.campagne (id, slug, titre, theme, brief, criteres, ouverture_inscriptions, cloture_depot, date_resultats, max_participants)
select '20000000-0000-4000-8000-000000000005', 'seed-resultats', 'Le minuteur de pause café', 'Un minuteur de pause café',
       E'Écris un minuteur de pause café.\nIl compte à rebours, prévient quand le café est prêt et se relance d''un clic.\nDonnée fictive.',
       c.c, '2026-12-01', '2026-12-15', '2026-12-31', 10
from seed_criteres c;

insert into public.participation (id, campagne_id, compte_id)
select ('30000000-0000-4000-8000-0000000000' || v.n)::uuid, '20000000-0000-4000-8000-000000000005',
       ('10000000-0000-4000-8000-0000000000' || v.compte)::uuid
from (values ('5a', 'd1'), ('5b', 'd2'), ('5c', 'd3'), ('5d', 'd4'), ('5e', 'd5'), ('5f', 'd6')) v(n, compte);

-- Note de chaque candidat : tous les critères, outillage compris, reçoivent cette note.
create temp table seed_resultats_notes (n text, note integer, boss integer) on commit drop;
insert into seed_resultats_notes values ('5a', 8, 8), ('5b', 6, 8), ('5c', 9, 9), ('5d', 7, 7), ('5e', 7, 7), ('5f', 5, 6);

insert into public.depot (
  participation_id, sha256, taille_octets, nb_fichiers, nb_tokens, presentation, demande, type_code,
  licence_presente, declaration_code_le, alerte_manipulation, note_outillage
)
select p.id, encode(sha256(convert_to(p.id::text, 'UTF8')), 'hex'), 1000, 10, 1000,
       'Présentation fictive.',
       case when s.n = '5a' then 'Mon découpage en modules est-il trop fin ?' end,
       'open_source', true, now(), s.n = '5c', s.note
from seed_resultats_notes s join public.participation p on p.id = ('30000000-0000-4000-8000-0000000000' || s.n)::uuid;

insert into public.audit (depot_id, jure, modele, version_consignes, statut, replique_masquee, resultat, usage, cout_usd)
select d.id, j.jure, 'modele-fictif', 'consignes-fictives', 'termine', s.n = '5e' and j.jure = 'sudo',
       jsonb_build_object(
         'criteres', (
           select jsonb_agg(jsonb_build_object(
             'cle', k ->> 'cle', 'note', s.note,
             'justification', 'Justification fictive pour « ' || (k ->> 'libelle') || ' » : le code fait ce qu''il annonce, avec quelques réserves.',
             'preuves', jsonb_build_array(
               jsonb_build_object('fichier', 'src/minuteur.ts', 'ligne', 12, 'constat', 'Constat fictif : le décompte est calculé ici.'),
               jsonb_build_object('fichier', 'README.md', 'ligne', 3, 'constat', 'Constat fictif : le lancement est expliqué.')
             )
           ))
           from public.campagne c, jsonb_array_elements(c.criteres) k
           where c.id = p.campagne_id and k ->> 'jure' = j.jure and not coalesce((k ->> 'calcule')::boolean, false)
         ),
         'points_forts', jsonb_build_array('Point fort fictif relevé par ' || j.jure || '.'),
         'a_ameliorer', jsonb_build_array('Piste fictive proposée par ' || j.jure || '.'),
         'manipulation_detectee', case when s.n = '5c' and j.jure = 'sudo'
           then jsonb_build_object('detectee', true, 'preuves', jsonb_build_array(
             jsonb_build_object('fichier', 'README.md', 'ligne', 3, 'constat', 'Phrase fictive adressée au jury.')))
           else jsonb_build_object('detectee', false, 'preuves', '[]'::jsonb) end,
         'verdict', case when s.note >= 6 then 'convaincu' else 'pas_convaincu' end,
         'replique', 'Réplique fictive de ' || j.jure || ' à ' || co.pseudo || '.'
       ),
       '{}', 0
from public.depot d
join public.participation p on p.id = d.participation_id
join public.compte co on co.id = p.compte_id
join seed_resultats_notes s on ('30000000-0000-4000-8000-0000000000' || s.n)::uuid = p.id
cross join (values ('sudo'), ('refacto'), ('lint'), ('pitch')) j(jure)
where p.campagne_id = '20000000-0000-4000-8000-000000000005';

insert into public.vote_boss (participation_id, note, verrouille_le)
select ('30000000-0000-4000-8000-0000000000' || n)::uuid, boss, now() from seed_resultats_notes;

insert into public.decision (campagne_id, participation_id, type, justification)
values ('20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-00000000005c', 'disqualification',
        'Tentative de manipulation du jury confirmée (donnée fictive).'),
       ('20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-00000000005d', 'departage',
        'Égalité parfaite ; le code de margaret est le mieux testé (donnée fictive).');

update public.campagne set statut = 'inscriptions' where slug = 'seed-resultats';
update public.campagne set statut = 'depot' where slug = 'seed-resultats';
update public.campagne set statut = 'deliberation' where slug = 'seed-resultats';
update public.campagne set statut = 'prete' where slug = 'seed-resultats';
update public.campagne set statut = 'publiee' where slug = 'seed-resultats';
