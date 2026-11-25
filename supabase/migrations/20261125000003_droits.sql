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

-- compte : chacun lit sa ligne et rien d'autre ; aucune écriture directe, seulement creer_compte (AD-1, AD-3).
-- Le rôle de service n'a aucun droit direct : il ne fait qu'exécuter creer_compte (security definer).
alter table public.compte enable row level security;
revoke all on public.compte from service_role;
grant select on public.compte to authenticated;
create policy compte_lecture on public.compte for select to authenticated using (id = (select auth.uid()));
revoke all on function public.est_admin(), public.compte_actif() from service_role;
grant execute on function public.est_admin(), public.compte_actif() to authenticated;
grant execute on function public.creer_compte(uuid, text, text, boolean, boolean) to service_role;

-- reglage : aucun droit client ni du rôle de service (sa lecture se décide avec la story 1.3) ; ligne unique, mode ouvert.
alter table public.reglage enable row level security;
revoke all on public.reglage from service_role;
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
