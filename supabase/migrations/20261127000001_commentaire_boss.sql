-- Vote du Boss lu par son candidat : la note et le commentaire de sa participation, après publication et une fois le vote
-- verrouillé. Une vue étroite plutôt qu'une colonne de plus dans classement (public) ou rapport (audits). Après la suppression
-- du compte, compte_id est nul (et le commentaire vidé par participation_apres_depart) : la vue ne rend plus rien.
create view public.mon_vote_boss with (security_invoker = false) as
select p.campagne_id, v.note, v.commentaire
from public.vote_boss v
join public.participation p on p.id = v.participation_id
join public.campagne c on c.id = p.campagne_id
where p.compte_id = (select auth.uid()) and c.statut in ('publiee', 'archivee') and v.verrouille_le is not null;

grant select on public.mon_vote_boss to authenticated;
