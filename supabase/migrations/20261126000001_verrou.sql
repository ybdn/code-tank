-- Bail d'exclusion entre appels du jury (dépôt privé, fonction /api/jury) : deux passages simultanés, même sur deux instances,
-- créeraient deux lots d'audits, donc des frais en double. Un nom, un détenteur, une expiration : le bail se prend si le nom est
-- libre ou expiré, en une seule instruction ; un détenteur disparu libère le nom en expirant.
create table public.verrou (
  nom text primary key check (char_length(nom) between 1 and 40),
  detenteur text not null check (char_length(detenteur) between 1 and 80),
  expire_le timestamptz not null
);

-- Aucune politique et aucun privilège pour anon ni authenticated : seul le rôle de service y accède.
alter table public.verrou enable row level security;

-- true si le bail est pris. L'INSERT ... ON CONFLICT DO UPDATE ... WHERE est atomique : la ligne existante est verrouillée, et
-- la condition d'expiration est réévaluée après l'attente, si bien que de deux appels simultanés un seul peut réussir.
create function public.prendre_verrou(p_nom text, p_detenteur text, p_secondes integer)
returns boolean
language plpgsql set search_path = ''
as $$
declare
  v_nom text;
begin
  if p_secondes not between 1 and 3600 then
    raise exception 'Durée du bail mal réglée.';
  end if;
  insert into public.verrou as v (nom, detenteur, expire_le)
  values (p_nom, p_detenteur, clock_timestamp() + make_interval(secs => p_secondes))
  on conflict (nom) do update set detenteur = excluded.detenteur, expire_le = excluded.expire_le
  where v.expire_le <= clock_timestamp()
  returning v.nom into v_nom;
  return v_nom is not null;
end
$$;

-- true si le bail est rendu ; false si le nom n'est pas tenu par ce détenteur (autre détenteur, ou bail expiré puis repris).
create function public.rendre_verrou(p_nom text, p_detenteur text)
returns boolean
language plpgsql set search_path = ''
as $$
begin
  delete from public.verrou where nom = p_nom and detenteur = p_detenteur;
  return found;
end
$$;

revoke all on function public.prendre_verrou(text, text, integer), public.rendre_verrou(text, text) from public, anon, authenticated;
grant execute on function public.prendre_verrou(text, text, integer), public.rendre_verrou(text, text) to service_role;
