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
