-- Case « d'accord pour être contacté au sujet d'une réutilisation » (SPECS § 9, § 16) : modifiable à tout moment par le
-- candidat, y compris après la clôture. Cette fonction ne change que cette case, dans depot et dans reception quand ces
-- lignes existent, et seulement pour la participation du candidat qui appelle.
create function public.regler_contact_reutilisation(p_campagne_id uuid, p_accord boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_depot integer;
  v_reception integer;
begin
  if auth.uid() is null then
    raise exception 'Connecte-toi pour modifier ce réglage.' using errcode = '42501';
  end if;
  update public.depot d set contact_reutilisation = p_accord
  from public.participation p
  where p.id = d.participation_id and p.campagne_id = p_campagne_id
    and p.compte_id = (select auth.uid()) and p.etat = 'inscrit';
  get diagnostics v_depot = row_count;
  update public.reception r set contact_reutilisation = p_accord
  from public.participation p
  where p.id = r.participation_id and p.campagne_id = p_campagne_id
    and p.compte_id = (select auth.uid()) and p.etat = 'inscrit';
  get diagnostics v_reception = row_count;
  if v_depot + v_reception = 0 then
    raise exception 'Tu n''as ni dépôt ni envoi dans cette campagne.';
  end if;
end
$$;
revoke all on function public.regler_contact_reutilisation(uuid, boolean) from public, anon, authenticated;
grant execute on function public.regler_contact_reutilisation(uuid, boolean) to authenticated;
