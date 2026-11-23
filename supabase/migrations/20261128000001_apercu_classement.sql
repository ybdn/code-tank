-- Aperçu du classement pour l'organisateur, avant la publication. Le calcul (score Claude, score final, rang) sort de la vue
-- publique dans une vue interne, classement_calcul, lisible de personne : la vue `classement` et la fonction
-- apercu_classement lisent la même règle, sans copie.

-- 1. Calcul, toutes campagnes, tous statuts. Aucun droit pour anon ni authenticated : seules la vue publique (filtrée sur les
-- campagnes publiées ou archivées) et la fonction de l'organisateur le lisent, avec les droits de leur propriétaire.
create view public.classement_calcul with (security_invoker = false) as
select t.campagne_id, t.statut, t.participation_id, t.pseudo, t.vote_verrouille, t.score_claude, t.note_boss, t.score_final,
       t.justification, t.notes, t.disqualifie, t.justification_departage,
       case when t.classable
            then rank() over (partition by t.campagne_id, t.classable order by t.score_final desc, t.departage desc)
       end as rang
from (
  select
    c.id as campagne_id,
    c.statut,
    p.id as participation_id,
    coalesce(co.pseudo, 'candidat supprimé') as pseudo,
    v.participation_id is not null as vote_verrouille,
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
) t;
revoke all on public.classement_calcul from public, anon, authenticated;

-- 2. Vue publique : mêmes colonnes, même ordre qu'avant, campagnes publiées ou archivées seulement.
drop view public.classement;
create view public.classement with (security_invoker = false) as
select campagne_id, pseudo, score_claude, note_boss, score_final, justification, notes, disqualifie,
       justification_departage, rang
from public.classement_calcul
where statut in ('publiee', 'archivee');
grant select on public.classement to anon, authenticated;

-- 3. Aperçu de l'organisateur, quel que soit le statut de la campagne. Vote à l'aveugle : tant que le vote du Boss d'une
-- participation n'est pas verrouillé, son score Claude et ses notes restent cachés (nuls), comme les audits le sont déjà.
-- Sans vote verrouillé, il n'y a de toute façon ni score final ni rang.
create function public.apercu_classement(p_campagne_id uuid)
returns table (
  participation_id uuid,
  pseudo text,
  rang bigint,
  vote_verrouille boolean,
  score_claude numeric,
  note_boss integer,
  score_final numeric,
  notes jsonb,
  disqualifie boolean,
  justification text,
  justification_departage text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.est_organisateur() then
    raise exception 'Réservé à l''organisateur.' using errcode = '42501';
  end if;
  return query
  select k.participation_id, k.pseudo, k.rang, k.vote_verrouille,
         case when k.vote_verrouille then k.score_claude end,
         k.note_boss, k.score_final,
         case when k.vote_verrouille then k.notes end,
         k.disqualifie, k.justification, k.justification_departage
  from public.classement_calcul k
  where k.campagne_id = p_campagne_id
  order by k.rang asc nulls last, k.pseudo asc;
end
$$;
revoke all on function public.apercu_classement(uuid) from public, anon, authenticated;
grant execute on function public.apercu_classement(uuid) to authenticated;
