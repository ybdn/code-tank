-- Démasquer une réplique : l'inverse de masquer_replique, avec les mêmes contrôles (organisateur seul,
-- audit existant), sans autre condition. L'organisateur n'a toujours aucun droit d'écriture direct sur audit.
create function public.demasquer_replique(p_audit_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_organisateur() then
    raise exception 'Réservé à l''organisateur.' using errcode = '42501';
  end if;
  update public.audit set replique_masquee = false where id = p_audit_id;
  if not found then
    raise exception 'Audit introuvable.';
  end if;
end
$$;
revoke all on function public.demasquer_replique(uuid) from public, anon, authenticated;
grant execute on function public.demasquer_replique(uuid) to authenticated;
