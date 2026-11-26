-- Droits d'accès (AD-1) : RLS sur toutes les tables ; anon et authenticated n'écrivent jamais directement.
-- Le rôle de service contourne la RLS : debit et verrou ne servent qu'à lui.

-- revoke all par défaut, aussi sur ce qui existait avant les privilèges par défaut de …_tables.sql.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- debit, verrou : aucune politique et aucun privilège client.
alter table public.debit enable row level security;
alter table public.verrou enable row level security;

grant execute on function public.consommer_debit(text, text, integer, integer) to service_role;
grant execute on function public.prendre_verrou(text, text, integer), public.rendre_verrou(text, text) to service_role;

-- compte : chacun lit sa ligne et rien d'autre ; aucune écriture directe, seulement creer_compte et changer_pseudo (AD-1, AD-3).
-- Le rôle de service n'a aucun droit direct : il ne fait qu'exécuter creer_compte (security definer).
alter table public.compte enable row level security;
revoke all on public.compte from service_role;
grant select on public.compte to authenticated;
create policy compte_lecture on public.compte for select to authenticated using (id = (select auth.uid()));
revoke all on function public.est_admin(), public.compte_actif() from service_role;
grant execute on function public.est_admin(), public.compte_actif() to authenticated;
grant execute on function public.creer_compte(uuid, text, text, boolean, boolean) to service_role;

-- regler_mode_acces et changer_pseudo : authenticated seul ; les gardes (est_admin(), état en_attente) vivent dans les
-- fonctions, si bien qu'un appel direct par /rest/v1/rpc ne contourne rien.
revoke all on function public.regler_mode_acces(text), public.changer_pseudo(text) from service_role;
grant execute on function public.regler_mode_acces(text), public.changer_pseudo(text) to authenticated;

-- reglage : lu par l'admin seul (un visiteur apprend la fermeture par le refus de creer_compte), écrit par
-- regler_mode_acces seul ; aucun droit du rôle de service ; ligne unique, mode ouvert.
alter table public.reglage enable row level security;
revoke all on public.reglage from service_role;
grant select on public.reglage to authenticated;
create policy reglage_lecture_admin on public.reglage for select to authenticated using ((select public.est_admin()));
insert into public.reglage default values;

-- critere : lecture par tous, aucune écriture, pas même du rôle de service (AD-8) : seule cette migration la remplit.
alter table public.critere enable row level security;
revoke all on public.critere from service_role;
grant select on public.critere to service_role;
grant select on public.critere to anon, authenticated;
create policy critere_lecture on public.critere for select to anon, authenticated using (true);

-- Les huit critères (même liste que prive/jury/src/criteres.ts, SPECS § 5) : 100 points au total.
insert into public.critere (cle, libelle, jure, poids, calcule) values
  ('securite', 'Sécurité', 'sudo', 15, false),
  ('erreurs_cas_limites', 'Gestion des erreurs et cas limites', 'sudo', 10, false),
  ('structure_decoupage', 'Structure et découpage', 'refacto', 15, false),
  ('lisibilite_nommage', 'Lisibilité et nommage', 'refacto', 10, false),
  ('tests', 'Tests', 'lint', 15, false),
  ('outillage_doc', 'Outillage et doc : README, lint, CI, instructions de lancement', 'lint', 10, true),
  ('reponse_brief', 'Réponse au brief', 'pitch', 15, false),
  ('originalite_finition', 'Originalité et finition', 'pitch', 10, false);

-- campagne (story 2.1) : le Boss lit ses campagnes et rien d'autre, jeton d'invitation compris (le public lit la vue
-- campagne_phase, plus bas, qui ne le porte pas) ; le rôle de service lit six colonnes (prive, en fin de fichier) ;
-- aucune écriture directe, pas même du rôle de service : creer_campagne, modifier_campagne, supprimer_brouillon et
-- ouvrir_campagne seules. Ces quatre RPC sont exécutables par authenticated seul et tiennent toutes leurs règles (compte_actif(), est_boss, verrou
-- de la ligne, campagne_vivante) : un appel direct par /rest/v1/rpc ne contourne rien. Les gardes est_boss et
-- campagne_vivante, le contrôle verifier_reglages et le déclencheur ne sont exécutables par aucun client.
alter table public.campagne enable row level security;
revoke all on public.campagne from service_role;
grant select on public.campagne to authenticated;
create policy campagne_lecture_boss on public.campagne for select to authenticated using (boss_id = (select auth.uid()));
revoke all on function public.est_boss(uuid), public.campagne_vivante(uuid), public.garder_transition(),
  public.verifier_reglages(text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz)
  from service_role;
revoke all on function
  public.creer_campagne(text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz),
  public.modifier_campagne(uuid, text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz),
  public.supprimer_brouillon(uuid),
  public.ouvrir_campagne(uuid)
  from service_role;
grant execute on function
  public.creer_campagne(text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz),
  public.modifier_campagne(uuid, text, text, text, text[], text, text, integer, timestamptz, timestamptz, timestamptz),
  public.supprimer_brouillon(uuid),
  public.ouvrir_campagne(uuid)
  to authenticated;

-- campagne_phase (story 2.2) : lecture seule pour anon et authenticated, rien pour le rôle de service. La vue filtre
-- elle-même (brouillon, expirée, bloquée, invitation hors Boss et inscrits) : elle lit campagne_calculee, campagne, compte et
-- participation avec les droits de postgres. campagne_calculee (story 2.4), qui porte boss_id et le jeton : aucun droit client.
revoke all on public.campagne_phase, public.campagne_calculee from service_role;
grant select on public.campagne_phase to anon, authenticated;

-- participation (story 2.3) : chaque compte lit ses lignes et rien d'autre (les places restantes se lisent dans
-- campagne_phase) ; aucune écriture directe, pas même du rôle de service, qui ne lit que deux colonnes (prive, en fin de
-- fichier) : sinscrire et se_desinscrire
-- seules, exécutables par authenticated seul. Leurs règles vivent dans les fonctions (verrou de la campagne, compte_actif(),
-- phase, places, limite de débit par compte) : un appel direct par /rest/v1/rpc ne contourne rien.
alter table public.participation enable row level security;
revoke all on public.participation from service_role;
grant select on public.participation to authenticated;
create policy participation_lecture on public.participation for select to authenticated using (compte_id = (select auth.uid()));
revoke all on function public.sinscrire(uuid, boolean, text), public.se_desinscrire(uuid) from service_role;
grant execute on function public.sinscrire(uuid, boolean, text), public.se_desinscrire(uuid) to authenticated;

-- Invitation (story 2.4) : lire_invitation et regenerer_invitation, exécutables par authenticated seul. Leurs règles vivent
-- dans les fonctions (forme et égalité du jeton ; Boss, verrou, campagne_vivante, compte_actif(), visibilité) : un appel direct
-- par /rest/v1/rpc ne contourne rien. Le jeton ne se lit que par la ligne du Boss (campagne_lecture_boss) et par ces RPC.
revoke all on function public.lire_invitation(text), public.regenerer_invitation(uuid) from service_role;
grant execute on function public.lire_invitation(text), public.regenerer_invitation(uuid) to authenticated;

-- Dépôt (story 3.3) : reception et depot, chacun lit les lignes de ses participations et rien d'autre, ni l'autre candidat
-- ni le Boss (la lecture du Boss juge vient à l'epic 5) ; colonnes choisies : ni les chemins de stockage, ni les tentatives,
-- ni les faits, la note d'outillage et les alertes (lues du seul Boss juge, SPECS § 13). Aucune écriture directe, pas même
-- du rôle de service : deposer et retirer_depot pour le candidat, noter_tentative_reception, refuser_reception et
-- accepter_depot pour prive (rôle de service seul, story 3.4). deposer, retirer_depot et peut_deposer sont exécutables par authenticated seul et tiennent toutes
-- leurs règles (verrou de la campagne, campagne_vivante, compte_actif(), phase, Boss juge, inscription, chemin et objet du
-- bucket, limite de débit par compte) : un appel direct par /rest/v1/rpc ne contourne rien. effacer_archives : rôle de
-- service seul (AD-11). Le bucket depots n'a aucune politique (…_tables.sql) : le site signe et efface avec la clé de service.
alter table public.reception enable row level security;
alter table public.depot enable row level security;
revoke all on public.reception, public.depot from service_role;
grant select (id, participation_id, presentation, demande, droit_declare_le, statut, motifs, cree_le) on public.reception to authenticated;
grant select (id, participation_id, sha256, nb_fichiers, fichiers_exclus, nb_tokens_estime, nb_tokens_exact, trop_gros,
  presentation, demande, droit_declare_le, depose_le) on public.depot to authenticated;
create policy reception_lecture on public.reception for select to authenticated
  using (exists (select 1 from public.participation p where p.id = participation_id and p.compte_id = (select auth.uid())));
create policy depot_lecture on public.depot for select to authenticated
  using (exists (select 1 from public.participation p where p.id = participation_id and p.compte_id = (select auth.uid())));
revoke all on function public.peut_deposer(uuid), public.deposer(uuid, text, text, text, boolean), public.retirer_depot(uuid)
  from service_role;
grant execute on function public.peut_deposer(uuid), public.deposer(uuid, text, text, text, boolean), public.retirer_depot(uuid)
  to authenticated;
grant execute on function public.effacer_archives(public.depot) to service_role;

-- prive (story 3.4, AD-1) : il lit en direct, avec le rôle de service, les colonnes qui trouvent les réceptions en attente et
-- l'état de leur campagne, et rien d'autre (ni présentation, ni dépôt : accepter_depot recopie et rend ce qu'il faut ; la
-- story 4.4 ouvre ensuite quelques colonnes de depot et campagne pour la délibération). Il
-- écrit seulement par noter_tentative_reception, refuser_reception et accepter_depot, exécutables par le rôle de service seul.
grant select (id, participation_id, chemin_stockage, statut, cree_le) on public.reception to service_role;
grant select (id, campagne_id) on public.participation to service_role;
grant select (id, statut, bloquee_le, date_resultats) on public.campagne to service_role;
grant execute on function public.noter_tentative_reception(uuid), public.refuser_reception(uuid, jsonb),
  public.accepter_depot(uuid, text, text, integer, jsonb, integer, jsonb, integer, boolean, jsonb) to service_role;

-- audit (story 4.2) : aucune politique ni aucun droit pour anon et authenticated (la lecture du Boss vient aux stories 4.7
-- et epic 5) ; le rôle de service lit seulement : il écrit par les fonctions de la story 4.4, pas directement.
-- estimer_pire_cas : authenticated (le Boss de la campagne seul, garde dans la fonction : un appel direct par /rest/v1/rpc
-- ne contourne rien) et rôle de service (prive).
alter table public.audit enable row level security;
revoke all on public.audit from service_role;
grant select on public.audit to service_role;
revoke all on function public.estimer_pire_cas(uuid) from public, anon;
grant execute on function public.estimer_pire_cas(uuid) to authenticated, service_role;

-- Délibération (story 4.3, AD-4) : engagement sans politique ni droit client ni droit direct du rôle de service (écrite par
-- lancer_deliberation seule). lancer_deliberation, lire_cle_boss et effacer_cle_boss : rôle de service seul, jamais
-- authenticated (PostgREST les exposerait : la règle count_tokens est tenue par la route, et la clé ne se lit pas). Le schéma
-- vault n'est ouvert ni à anon ni à authenticated (Supabase) ; les fonctions security definer y accèdent avec les droits de postgres.
alter table public.engagement enable row level security;
revoke all on public.engagement from service_role;
revoke all on function public.lancer_deliberation(uuid, uuid, text, numeric, text), public.lire_cle_boss(uuid),
  public.effacer_cle_boss(uuid) from public, anon, authenticated;
grant execute on function public.lancer_deliberation(uuid, uuid, text, numeric, text), public.lire_cle_boss(uuid),
  public.effacer_cle_boss(uuid) to service_role;
-- depense_audits, comme estimer_pire_cas : le Boss de la campagne seul (garde dans la fonction) et le rôle de service.
revoke all on function public.depense_audits(uuid) from public, anon;
grant execute on function public.depense_audits(uuid) to authenticated, service_role;

-- Audits écrits par prive (story 4.4, AD-5) : ecrire_tokens_exacts, marquer_envoye et enregistrer_audit, rôle de service seul,
-- jamais authenticated (PostgREST les exposerait) ; cout_tokens, seule source des tarifs, n'est exécutable par aucun rôle :
-- estimer_pire_cas et enregistrer_audit l'appellent avec les droits de postgres. Aucune écriture directe sur audit ni depot.
revoke all on function public.cout_tokens(numeric, numeric, numeric, numeric, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.ecrire_tokens_exacts(uuid, integer), public.marquer_envoye(uuid[], text),
  public.enregistrer_audit(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ecrire_tokens_exacts(uuid, integer), public.marquer_envoye(uuid[], text),
  public.enregistrer_audit(uuid, text, jsonb, jsonb) to service_role;
-- Lectures directes de prive pour la délibération (story 4.5), en plus de celles de la story 3.4 et de critere et audit :
-- dépôt (archive filtrée à envoyer, faits du scan pour le juré, compte exact et trop_gros), brief de la campagne (consigne
-- du juré) et plafond (reste à dépenser). Rien d'autre : ni chemin du zip, ni présentation, ni alertes.
grant select (id, participation_id, chemin_filtre, faits, nb_tokens_exact, trop_gros) on public.depot to service_role;
grant select (brief, plafond_usd) on public.campagne to service_role;

-- Clôture et fin (story 4.6, AD-4 (4)) : cloturer_deliberation, terminer_deliberation et cloturer_cles_expirees, rôle de service
-- seul, jamais authenticated (PostgREST les exposerait : terminer_deliberation tient sa règle de la route, qui passe l'id
-- vérifié du Boss). Les fonctions internes (déclencheur, audits_termines, abandonner_audits) ne sont exécutables par aucun rôle.
revoke all on function public.cloturer_deliberation(uuid, boolean), public.terminer_deliberation(uuid, uuid),
  public.cloturer_cles_expirees() from public, anon, authenticated;
grant execute on function public.cloturer_deliberation(uuid, boolean), public.terminer_deliberation(uuid, uuid),
  public.cloturer_cles_expirees() to service_role;
revoke all on function public.effacer_cle_sortie(), public.audits_termines(uuid), public.abandonner_audits(uuid)
  from public, anon, authenticated, service_role;
