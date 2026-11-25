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

-- campagne (story 2.1) : le Boss lit ses campagnes et rien d'autre (le public lit la vue campagne_phase, plus bas) ;
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
-- elle-même (brouillon, expirée, bloquée, invitation hors Boss) : elle lit campagne et compte avec les droits de postgres.
revoke all on public.campagne_phase from service_role;
grant select on public.campagne_phase to anon, authenticated;

-- participation (story 2.3) : chaque compte lit ses lignes et rien d'autre (les places restantes se lisent dans
-- campagne_phase) ; aucune écriture directe, pas même du rôle de service, qui n'a aucun droit : sinscrire et se_desinscrire
-- seules, exécutables par authenticated seul. Leurs règles vivent dans les fonctions (verrou de la campagne, compte_actif(),
-- phase, places, limite de débit par compte) : un appel direct par /rest/v1/rpc ne contourne rien.
alter table public.participation enable row level security;
revoke all on public.participation from service_role;
grant select on public.participation to authenticated;
create policy participation_lecture on public.participation for select to authenticated using (compte_id = (select auth.uid()));
revoke all on function public.sinscrire(uuid, boolean), public.se_desinscrire(uuid) from service_role;
grant execute on function public.sinscrire(uuid, boolean), public.se_desinscrire(uuid) to authenticated;
