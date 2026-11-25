-- Fonctions du socle, réservées au rôle de service (droits dans …_droits.sql).

-- Compte les lignes de l'empreinte pour l'action dans la fenêtre : au-delà du maximum, renvoie le nombre de secondes à
-- attendre ; sinon enregistre l'appel et renvoie 0. Le verrou consultatif (par empreinte et action, levé en fin de
-- transaction) sérialise deux requêtes simultanées : le dernier créneau n'en laisse passer qu'une.
-- La purge ne touche que les lignes de plus de 24 heures de cette empreinte.
create function public.consommer_debit(p_empreinte text, p_action text, p_maximum integer, p_fenetre_s integer)
returns integer
language plpgsql set search_path = ''
as $$
declare
  v_nb integer;
  v_premier timestamptz;
begin
  if p_maximum < 1 or p_fenetre_s not between 1 and 86400 then
    raise exception 'Limite de débit mal réglée.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_empreinte || ':' || p_action, 0));
  delete from public.debit where empreinte = p_empreinte and le < now() - interval '24 hours';
  select count(*), min(le) into v_nb, v_premier
  from public.debit
  where empreinte = p_empreinte and action = p_action and le > now() - make_interval(secs => p_fenetre_s);
  if v_nb >= p_maximum then
    return greatest(1, ceil(extract(epoch from v_premier + make_interval(secs => p_fenetre_s) - now()))::integer);
  end if;
  insert into public.debit (empreinte, action) values (p_empreinte, p_action);
  return 0;
end
$$;

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
