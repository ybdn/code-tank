-- Droits d'accès : RLS sur toutes les tables, privilèges au plus juste, vues de lecture.
-- Sans privilège ni politique, anon et authenticated n'obtiennent rien. Le serveur écrit avec
-- la clé de service (service_role), qui contourne la RLS : aucune politique d'écriture client
-- sur depot, audit et decision.

alter table public.compte enable row level security;
alter table public.reglage enable row level security;
alter table public.campagne enable row level security;
alter table public.participation enable row level security;
alter table public.depot enable row level security;
alter table public.audit enable row level security;
alter table public.vote_boss enable row level security;
alter table public.decision enable row level security;

-- compte : le sien et l'organisateur. Le candidat n'écrit que ses champs de profil ; role,
-- etat, github_id, github_donnees et les dates d'état n'ont aucun privilège d'écriture.
grant select on public.compte to authenticated;
grant update (vrai_nom, pseudo, email_contact, motivation, depot_cite_url) on public.compte to authenticated;
create policy compte_lecture on public.compte for select to authenticated
  using (id = (select auth.uid()) or (select public.est_organisateur()));
create policy compte_profil on public.compte for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- reglage : l'organisateur seul, en lecture et en modification de la ligne existante.
grant select on public.reglage to authenticated;
grant update (plafond_comptes, plafond_depense_usd) on public.reglage to authenticated;
create policy reglage_organisateur on public.reglage for all to authenticated
  using ((select public.est_organisateur())) with check ((select public.est_organisateur()));

-- campagne : visible de tous hors brouillon. L'organisateur la crée et la modifie, mais statut
-- et regles_figees_le n'ont pas de privilège d'écriture (statut : changer_statut_campagne).
grant select on public.campagne to anon, authenticated;
grant insert (slug, titre, theme, brief, criteres, ouverture_inscriptions, cloture_depot, date_resultats, max_participants),
      update (slug, titre, theme, brief, criteres, ouverture_inscriptions, cloture_depot, date_resultats, max_participants)
  on public.campagne to authenticated;
create policy campagne_ouverte on public.campagne for select to anon, authenticated
  using (statut <> 'brouillon');
create policy campagne_organisateur on public.campagne for all to authenticated
  using ((select public.est_organisateur())) with check ((select public.est_organisateur()));

-- participation : la sienne et l'organisateur. Les écritures passent par les fonctions.
grant select on public.participation to authenticated;
create policy participation_lecture on public.participation for select to authenticated
  using (compte_id = (select auth.uid()) or (select public.est_organisateur()));

-- depot : le sien tant que la campagne n'est ni en délibération ni prête, et l'organisateur.
-- contact_reutilisation n'est pas lisible directement (voir la vue plus bas).
grant select (
  id, participation_id, chemin_stockage, sha256, taille_octets, nb_fichiers, fichiers_exclus,
  nb_tokens, presentation, demande, type_code, licence_presente, declaration_code_le, outils_ia,
  traces_ia, alerte_manipulation, alertes_integrite, depose_le, faits, note_outillage
) on public.depot to authenticated;
create policy depot_lecture on public.depot for select to authenticated
  using (
    (select public.est_organisateur())
    or exists (
      select 1 from public.participation p join public.campagne c on c.id = p.campagne_id
      where p.id = depot.participation_id and p.compte_id = (select auth.uid())
        and c.statut not in ('deliberation', 'prete')
    )
  );

-- audit : lisible de l'organisateur seul, et seulement une fois son vote verrouillé pour ce
-- dépôt (vote à l'aveugle). Le candidat lit son rapport par la vue « rapport ».
grant select on public.audit to authenticated;
create policy audit_organisateur on public.audit for select to authenticated
  using (
    (select public.est_organisateur())
    and exists (
      select 1 from public.depot d join public.vote_boss v on v.participation_id = d.participation_id
      where d.id = audit.depot_id and v.verrouille_le is not null
    )
  );

-- vote_boss : l'organisateur seul. Il note et commente tant que la campagne est en délibération
-- ou prête ; le verrouillage passe par verrouiller_vote, le gel par le déclencheur.
grant select on public.vote_boss to authenticated;
grant insert (participation_id, note, commentaire), update (note, commentaire) on public.vote_boss to authenticated;
create policy vote_boss_lecture on public.vote_boss for select to authenticated
  using ((select public.est_organisateur()));
create policy vote_boss_ecriture on public.vote_boss for insert to authenticated
  with check (
    (select public.est_organisateur())
    and exists (
      select 1 from public.participation p join public.campagne c on c.id = p.campagne_id
      where p.id = vote_boss.participation_id and c.statut in ('deliberation', 'prete')
    )
  );
create policy vote_boss_modification on public.vote_boss for update to authenticated
  using ((select public.est_organisateur()))
  with check (
    exists (
      select 1 from public.participation p join public.campagne c on c.id = p.campagne_id
      where p.id = vote_boss.participation_id and c.statut in ('deliberation', 'prete')
    )
  );

-- decision : lisible de l'organisateur seul (le public voit la disqualification par le classement).
grant select on public.decision to authenticated;
create policy decision_lecture on public.decision for select to authenticated
  using ((select public.est_organisateur()));

-- Vues -------------------------------------------------------------------------------------
-- Elles s'exécutent avec les droits de leur propriétaire (security_invoker = false), donc sans
-- RLS : leur clause where est la seule barrière, et elle ne montre que ce qui est voulu.

-- Classement public (SPECS § 7). Score Claude = Σ poids × note / 10 ; une note manquante
-- (audit absent, en échec, ou note d'outillage non calculée) donne un score nul, jamais zéro.
-- Score final = 2/3 × score Claude + 1/3 × note du Boss × 10 (poids du Boss fixe, § 13).
-- La note du Boss n'apparaît qu'une fois son vote verrouillé. Seule une décision de
-- disqualification est publique ; une fermeture de compte ne l'est jamais.
create view public.classement with (security_invoker = false) as
select
  c.id as campagne_id,
  coalesce(co.pseudo, 'candidat supprimé') as pseudo,
  s.score_claude,
  v.note as note_boss,
  case when s.score_claude is not null and v.note is not null
       then (2 * s.score_claude + 10 * v.note) / 3 end as score_final,
  dq.justification
from public.campagne c
join public.participation p on p.campagne_id = c.id and p.etat = 'inscrit'
join public.depot d on d.participation_id = p.id
left join public.compte co on co.id = p.compte_id
left join public.vote_boss v on v.participation_id = p.id and v.verrouille_le is not null
left join public.decision dq on dq.participation_id = p.id and dq.type = 'disqualification'
cross join lateral (
  select case when count(*) > 0 and count(*) = count(k.poids * n.note)
              then sum(k.poids * n.note) / 10 end as score_claude
  from (
    select e ->> 'cle' as cle, e ->> 'jure' as jure, (e ->> 'poids')::numeric as poids,
           coalesce((e ->> 'calcule')::boolean, false) as calcule
    from jsonb_array_elements(c.criteres) e
  ) k
  cross join lateral (
    select case when k.calcule then d.note_outillage::numeric
      else (
        select (x ->> 'note')::numeric
        from public.audit a, jsonb_array_elements(a.resultat -> 'criteres') x
        where a.depot_id = d.id and a.jure = k.jure and a.statut = 'termine' and x ->> 'cle' = k.cle
      ) end as note
  ) n
) s
where c.statut in ('publiee', 'archivee');

-- Rapport et entretien du candidat : les siens, après publication, sans réplique masquée.
create view public.rapport with (security_invoker = false) as
select a.id, p.campagne_id, a.depot_id, a.jure,
       case when a.replique_masquee then a.resultat - 'replique' else a.resultat end as resultat
from public.audit a
join public.depot d on d.id = a.depot_id
join public.participation p on p.id = d.participation_id
join public.campagne c on c.id = p.campagne_id
where p.compte_id = (select auth.uid()) and c.statut in ('publiee', 'archivee') and a.statut = 'termine';

-- Case « d'accord pour être contacté » : au candidat concerné ; à l'organisateur une fois son
-- vote verrouillé pour cette participation (elle ne doit pas influencer le vote à l'aveugle).
create view public.contact_reutilisation_lisible with (security_invoker = false) as
select d.participation_id, d.contact_reutilisation
from public.depot d
join public.participation p on p.id = d.participation_id
where p.compte_id = (select auth.uid())
   or (
     (select public.est_organisateur())
     and exists (select 1 from public.vote_boss v where v.participation_id = d.participation_id and v.verrouille_le is not null)
   );

grant select on public.classement to anon, authenticated;
grant select on public.rapport, public.contact_reutilisation_lisible to authenticated;
