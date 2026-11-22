-- Second tour de relecture : dépôt caché au candidat, retrait du dépôt, publication protégée,
-- classement complet, pseudo figé.

-- 1. depot : lisible de l'organisateur seul. Le candidat lit son reçu par mon_depot, sans note
-- ni alerte (alerte_manipulation, alertes_integrite et traces_ia l'aideraient à contourner
-- la détection en redéposant).
drop policy depot_lecture on public.depot;
create policy depot_lecture on public.depot for select to authenticated
  using ((select public.est_organisateur()));

create view public.mon_depot with (security_invoker = false) as
select d.participation_id, d.sha256, d.taille_octets, d.nb_fichiers, d.fichiers_exclus, d.nb_tokens,
       d.presentation, d.demande, d.type_code, d.licence_presente, d.outils_ia,
       d.contact_reutilisation, d.depose_le
from public.depot d
join public.participation p on p.id = d.participation_id
where p.compte_id = (select auth.uid());
grant select on public.mon_depot to authenticated;

-- Le candidat lit sa case par mon_depot : ne reste que la branche organisateur.
create or replace view public.contact_reutilisation_lisible with (security_invoker = false) as
select d.participation_id, d.contact_reutilisation
from public.depot d
where (select public.est_organisateur())
  and exists (select 1 from public.vote_boss v where v.participation_id = d.participation_id and v.verrouille_le is not null);

-- 2. Retrait du dépôt. Les règles de la campagne restent figées : un dépôt a été reçu.
-- shortcut: l'archive du stockage n'est pas effacée ici, le serveur le fera dans un lot suivant.
create function public.retirer_depot(p_campagne_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.depot d
  using public.participation p, public.campagne c
  where p.id = d.participation_id and c.id = p.campagne_id and p.campagne_id = p_campagne_id
    and p.compte_id = (select auth.uid()) and p.etat = 'inscrit' and c.statut < 'deliberation';
  if not found then
    raise exception 'Retrait impossible : tu n''as pas de dépôt dans cette campagne, ou la délibération a commencé.';
  end if;
end
$$;
revoke all on function public.retirer_depot(uuid) from public, anon, authenticated;
grant execute on function public.retirer_depot(uuid) to authenticated;

-- La désinscription supprime aussi le dépôt (même réserve sur l'archive que ci-dessus).
create or replace function public.se_desinscrire(p_campagne_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.participation p set etat = 'retire', retire_le = now()
  from public.campagne c
  where c.id = p.campagne_id and p.campagne_id = p_campagne_id
    and p.compte_id = (select auth.uid()) and p.etat = 'inscrit'
    and c.statut < 'deliberation';
  if not found then
    raise exception 'Désinscription impossible : tu n''es pas inscrit, ou la délibération a commencé.';
  end if;
  delete from public.depot
  where participation_id = (
    select id from public.participation where campagne_id = p_campagne_id and compte_id = (select auth.uid()));
end
$$;

-- 3. Publication : chaque participation inscrite ayant un dépôt doit avoir un vote verrouillé.
create or replace function public.campagne_avant_maj() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.statut <> old.statut then
    if new.statut is distinct from (enum_range(old.statut, null))[2] then
      raise exception 'Transition de statut interdite : de % à %.', old.statut, new.statut;
    end if;
    if new.statut = 'inscriptions' and (
      select coalesce(sum((c ->> 'poids')::numeric), 0) from jsonb_array_elements(new.criteres) c
    ) <> 100 then
      raise exception 'Les poids des critères doivent totaliser 100 avant l''ouverture des inscriptions.';
    end if;
    if new.statut = 'publiee' and exists (
      select 1 from public.participation p
      join public.depot d on d.participation_id = p.id
      left join public.vote_boss v on v.participation_id = p.id
      where p.campagne_id = new.id and p.etat = 'inscrit' and v.verrouille_le is null
    ) then
      raise exception 'Publication impossible : le vote du Boss n''est pas verrouillé pour toutes les participations avec dépôt.';
    end if;
  end if;

  if old.regles_figees_le is not null
    and (new.brief, new.theme, new.criteres) is distinct from (old.brief, old.theme, old.criteres) then
    raise exception 'Les règles de la campagne sont figées depuis le premier dépôt.';
  end if;
  return new;
end
$$;

-- 5. Pseudo figé une fois le compte autorisé, pour une écriture venant du client.
create or replace function public.compte_avant_ecriture() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_plafond integer;
begin
  if tg_op = 'UPDATE' and new.etat <> old.etat then
    new.etat_le := now();
  end if;

  if new.etat = 'verifie' and (tg_op = 'INSERT' or old.etat <> 'verifie') then
    -- Le verrou sérialise deux vérifications simultanées sur la dernière place. Le compte est
    -- compté ensuite, dans une instruction à part, pour voir ce que l'autre a validé.
    select plafond_comptes into v_plafond from public.reglage for update;
    if v_plafond is not null and (
      select count(*) from public.compte
      where role = 'candidat' and etat in ('verifie', 'autorise') and id <> new.id
    ) >= v_plafond then
      new.etat := 'liste_attente';
      new.etat_le := now();
    end if;
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null then
    -- Une adresse modifiée depuis le client (identité présente) n'est plus vérifiée.
    if new.email_contact <> old.email_contact then
      new.email_verifie_le := null;
    end if;
    -- Le pseudo est public et l'organisateur a autorisé le compte en le voyant.
    if new.pseudo <> old.pseudo and old.etat = 'autorise' then
      raise exception 'Le pseudo ne se modifie plus une fois le compte autorisé.';
    end if;
  end if;
  return new;
end
$$;

-- 4. Classement complet. notes : clé de critère vers note (calculé compris), sans justification
-- ni preuve. rang : score final décroissant ; à égalité, une décision de départage place le
-- participant concerné devant ; nul pour un disqualifié ou sans score final.
drop view public.classement;
create view public.classement with (security_invoker = false) as
select t.campagne_id, t.pseudo, t.score_claude, t.note_boss, t.score_final, t.justification,
       t.notes, t.disqualifie, t.justification_departage,
       case when t.classable
            then rank() over (partition by t.campagne_id, t.classable order by t.score_final desc, t.departage desc)
       end as rang
from (
  select
    c.id as campagne_id,
    coalesce(co.pseudo, 'candidat supprimé') as pseudo,
    s.score_claude,
    v.note as note_boss,
    f.score_final,
    dq.justification,
    s.notes,
    dq.id is not null as disqualifie,
    dp.justification as justification_departage,
    dp.id is not null as departage,
    dq.id is null and f.score_final is not null as classable
  from public.campagne c
  join public.participation p on p.campagne_id = c.id and p.etat = 'inscrit'
  join public.depot d on d.participation_id = p.id
  left join public.compte co on co.id = p.compte_id
  left join public.vote_boss v on v.participation_id = p.id and v.verrouille_le is not null
  left join public.decision dq on dq.participation_id = p.id and dq.type = 'disqualification'
  left join public.decision dp on dp.participation_id = p.id and dp.type = 'departage'
  cross join lateral (
    select case when count(*) > 0 and count(*) = count(k.poids * n.note)
                then sum(k.poids * n.note) / 10 end as score_claude,
           jsonb_object_agg(k.cle, n.note) as notes
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
  cross join lateral (
    select case when s.score_claude is not null and v.note is not null
                then (2 * s.score_claude + 10 * v.note) / 3 end as score_final
  ) f
  where c.statut in ('publiee', 'archivee')
) t;
grant select on public.classement to anon, authenticated;
