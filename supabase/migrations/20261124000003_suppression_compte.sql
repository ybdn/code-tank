-- Suppression de compte (SPECS § 9) : la ligne du classement d'une campagne publiée reste sous « candidat supprimé »
-- avec ses scores, et plus aucune donnée personnelle ne survit. Les clés étrangères font déjà disparaître le compte
-- (compte, avec vrai nom, e-mail, motivation, dépôt cité et données GitHub) et mettent participation.compte_id à nul ;
-- ce déclencheur règle le reste, au même instant et dans la même transaction, quel que soit le chemin de la suppression
-- (route du site, ou plus tard compte inactif depuis 24 mois).
create function public.participation_apres_depart() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Rien à garder : sans dépôt (inscrit, retiré ou refusé au contrôle) ou campagne non publiée, il n'y aura pas de ligne au classement.
  if not exists (select 1 from public.depot where participation_id = new.id)
    or (select statut from public.campagne where id = new.campagne_id) not in ('publiee', 'archivee') then
    delete from public.participation where id = new.id; -- cascade : réception, dépôt, audits, vote, décisions
    return null;
  end if;

  -- La ligne reste pour le classement : scores (notes d'audit par critère, note d'outillage, note du Boss),
  -- décisions publiques de disqualification et de départage. Le reste est effacé ou vidé.
  delete from public.reception where participation_id = new.id;
  delete from public.decision where participation_id = new.id and type = 'fermeture_compte';
  update public.vote_boss set commentaire = null where participation_id = new.id and commentaire is not null;
  -- Les colonnes obligatoires reçoivent une valeur neutre (la contrainte exige 64 caractères hexadécimaux et une présentation non vide).
  update public.depot set
    chemin_stockage = null, sha256 = repeat('0', 64), presentation = '[effacé]', demande = null,
    fichiers_exclus = '[]', outils_ia = '[]', traces_ia = '[]', faits = null,
    alerte_manipulation = false, alertes_integrite = '[]', contact_reutilisation = false
  where participation_id = new.id;
  -- Rapport individuel : il ne reste de chaque audit que la clé et la note de ses critères, que la vue classement lit.
  update public.audit a set resultat = jsonb_build_object('criteres', coalesce((
    select jsonb_agg(jsonb_build_object('cle', x ->> 'cle', 'note', x -> 'note'))
    from jsonb_array_elements(a.resultat -> 'criteres') x
  ), '[]'::jsonb))
  where a.resultat is not null and a.depot_id = (select id from public.depot where participation_id = new.id);
  return null;
end
$$;
revoke all on function public.participation_apres_depart() from public, anon, authenticated;

create trigger participation_apres_depart after update of compte_id on public.participation
for each row when (old.compte_id is not null and new.compte_id is null)
execute function public.participation_apres_depart();

-- Un vote verrouillé ne change plus, sauf pour ce départ : il disparaît avec sa participation, ou perd son commentaire
-- (texte libre sur une personne) quand le compte est supprimé. Note et verrouillage restent intacts.
create or replace function public.vote_boss_fige() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.verrouille_le is not null then
    if tg_op = 'DELETE' then
      if not exists (select 1 from public.participation where id = old.participation_id) then
        return old;
      end if;
    elsif new.commentaire is null
      and (new.participation_id, new.note, new.verrouille_le) is not distinct from (old.participation_id, old.note, old.verrouille_le)
      and exists (select 1 from public.participation where id = old.participation_id and compte_id is null) then
      return new;
    end if;
    raise exception 'Le vote est verrouillé : il ne se modifie plus.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;
