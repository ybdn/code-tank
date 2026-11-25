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

-- Gardes des RPC (AD-1) : l'appelant vient du JWT (auth.uid()), jamais d'un paramètre.
create function public.est_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.compte where id = auth.uid() and role = 'admin' and etat = 'actif')
$$;

create function public.compte_actif()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.compte where id = auth.uid() and etat = 'actif')
$$;

-- Crée le compte de l'appelant. L'identifiant GitHub vient de auth.identities (écrite par Auth seul), jamais du client ;
-- la version de la charte vient du serveur du site. Messages fixes : le site les renvoie tels quels en 409.
create function public.creer_compte(p_pseudo text, p_version_charte text, p_charte_acceptee boolean, p_majeur boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_github text;
  v_contrainte text;
begin
  select provider_id into v_github from auth.identities where user_id = auth.uid() and provider = 'github';
  if v_github is null then
    raise exception 'Seule la connexion GitHub permet de créer un compte.';
  end if;
  if p_charte_acceptee is not true then
    raise exception 'Accepte la charte pour créer ton compte.';
  end if;
  if p_majeur is not true then
    raise exception 'Il faut avoir 18 ans ou plus.';
  end if;
  if p_pseudo is null or p_pseudo !~ '^[A-Za-z0-9_-]{3,39}$' then
    raise exception 'Le pseudo fait 3 à 39 caractères : lettres sans accent, chiffres, tiret ou souligné.';
  end if;
  if p_version_charte is null or char_length(p_version_charte) not between 1 and 40 then
    raise exception 'Version de la charte invalide.';
  end if;
  -- Les modes liste_attente et ferme arrivent avec la story 1.3 : d'ici là, hors mode ouvert, personne n'entre.
  if (select mode_acces from public.reglage) is distinct from 'ouvert' then
    raise exception 'Les inscriptions sont fermées pour le moment.';
  end if;
  insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
  values (auth.uid(), v_github, p_pseudo, now(), p_version_charte, now(), 'actif');
exception
  -- Les contraintes d'unicité tranchent, même entre deux appels simultanés.
  when unique_violation then
    get stacked diagnostics v_contrainte = constraint_name;
    if v_contrainte = 'compte_pseudo_unique' then
      raise exception 'Ce pseudo est déjà pris.';
    end if;
    raise exception 'Tu as déjà un compte.';
end
$$;
