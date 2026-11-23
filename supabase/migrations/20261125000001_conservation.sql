-- Conservation (SPECS § 9) : ce qu'il faut savoir pour que les tâches du serveur agissent, et les gestes du candidat.

-- 1. Date réelle de publication : l'archivage se fait 30 jours après. Renseignée par le changement de statut ; aucun
-- client ne l'écrit (pas de privilège de colonne). Les campagnes déjà publiées reçoivent la date du jour : 30 jours de grâce.
alter table public.campagne add column publiee_le timestamptz;
update public.campagne set publiee_le = now() where statut in ('publiee', 'archivee');

create function public.campagne_date_publication() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.statut = 'publiee' and old.statut <> 'publiee' then
    new.publiee_le := now();
  end if;
  return new;
end
$$;
revoke all on function public.campagne_date_publication() from public, anon, authenticated;
create trigger campagne_date_publication before update on public.campagne
for each row execute function public.campagne_date_publication();

-- 2. Liste d'attente : date de la demande de confirmation envoyée par e-mail. Nulle tant qu'aucune demande n'est en cours ;
-- elle repasse à nul quand l'état du compte change ou quand le candidat confirme.
alter table public.compte add column attente_demandee_le timestamptz;

create function public.compte_etat_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.attente_demandee_le := null;
  return new;
end
$$;
revoke all on function public.compte_etat_change() from public, anon, authenticated;
create trigger compte_etat_change before update of etat on public.compte
for each row when (old.etat is distinct from new.etat) execute function public.compte_etat_change();

-- Le candidat dit qu'il attend toujours (pour son compte seulement).
create function public.confirmer_attente() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.compte set confirme_attente_le = now(), attente_demandee_le = null
  where id = (select auth.uid()) and etat = 'liste_attente';
  if not found then
    raise exception 'Ton compte n''est pas en liste d''attente.';
  end if;
end
$$;

-- Dernière connexion : au plus une écriture par jour ; une connexion annule l'avertissement d'inactivité.
create function public.noter_connexion() returns void
language sql security definer set search_path = ''
as $$
  update public.compte set derniere_connexion_le = now(), prevenu_inactivite_le = null
  where id = (select auth.uid()) and derniere_connexion_le < now() - interval '1 day'
$$;

revoke all on function public.confirmer_attente(), public.noter_connexion() from public, anon, authenticated;
grant execute on function public.confirmer_attente(), public.noter_connexion() to authenticated;

-- 3. Tâches du serveur (rôle de service seul). Chaque fonction est bornée et idempotente.
-- Supprime au plus p_limite lignes de debit de plus de p_age_h heures ; renvoie leur nombre.
create function public.purger_debit(p_limite integer, p_age_h integer) returns integer
language plpgsql set search_path = ''
as $$
declare v_nb integer;
begin
  delete from public.debit where ctid in (
    select ctid from public.debit where le < now() - make_interval(hours => p_age_h) limit p_limite);
  get diagnostics v_nb = row_count;
  return v_nb;
end
$$;

-- Objets du bucket depots plus vieux que p_age_h heures, que ni depot ni reception ne référence : envois jamais confirmés.
-- Ne renvoie que des chemins, que le serveur efface par l'API de stockage.
create function public.objets_abandonnes(p_limite integer, p_age_h integer) returns setof text
language sql security definer set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'depots' and o.created_at < now() - make_interval(hours => p_age_h)
    and not exists (select 1 from public.depot d where d.chemin_stockage = o.name)
    and not exists (select 1 from public.reception r where r.chemin_stockage = o.name)
  order by o.created_at limit p_limite
$$;

revoke all on function public.purger_debit(integer, integer), public.objets_abandonnes(integer, integer) from public, anon, authenticated;
grant execute on function public.purger_debit(integer, integer), public.objets_abandonnes(integer, integer) to service_role;
