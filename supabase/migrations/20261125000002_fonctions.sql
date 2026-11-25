-- Fonctions du socle ; qui exécute quoi : …_droits.sql.

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

-- Crée le compte de p_compte. Réservée au rôle de service (AD-1) : le site l'appelle après avoir vérifié la session
-- (p_compte = id de l'utilisateur vérifié) et passé la limite par IP ; la version de la charte vient de son serveur.
-- L'identifiant GitHub vient de auth.identities (écrite par Auth seul), jamais d'un paramètre. Messages fixes : le site
-- les renvoie tels quels en 409.
create function public.creer_compte(p_compte uuid, p_pseudo text, p_version_charte text, p_charte_acceptee boolean, p_majeur boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_github text;
  v_mode text;
  v_contrainte text;
begin
  select provider_id into v_github from auth.identities where user_id = p_compte and provider = 'github';
  if v_github is null then
    raise exception 'Seule la connexion GitHub permet de créer un compte.';
  end if;
  -- Mode d'accès (SPECS § 3) : ouvert, le compte naît actif ; liste_attente, en attente ; ferme, aucune inscription.
  select mode_acces into v_mode from public.reglage;
  if coalesce(v_mode, 'ferme') = 'ferme' then
    raise exception 'Les inscriptions sont fermées pour le moment.';
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
  insert into public.compte (id, github_id, pseudo, charte_acceptee_le, version_charte, majeur_declare_le, etat)
  values (p_compte, v_github, p_pseudo, now(), p_version_charte, now(), case v_mode when 'ouvert' then 'actif' else 'en_attente' end);
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

-- Règle le mode d'accès (AD-3). Exécutable par authenticated : la garde est_admin() vit ici, pas dans la route.
create function public.regler_mode_acces(p_mode text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.';
  end if;
  if p_mode is null or p_mode not in ('ouvert', 'liste_attente', 'ferme') then
    raise exception 'Mode d''accès inconnu.';
  end if;
  update public.reglage set mode_acces = p_mode where id; -- WHERE exigé par pg-safeupdate sous PostgREST
end
$$;

-- Change le pseudo de l'appelant tant que son compte est en liste d'attente (SPECS § 3 : figé une fois actif ; un compte
-- suspendu l'a été actif, il reste figé). Même règle et mêmes messages que creer_compte.
create function public.changer_pseudo(p_pseudo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_pseudo is null or p_pseudo !~ '^[A-Za-z0-9_-]{3,39}$' then
    raise exception 'Le pseudo fait 3 à 39 caractères : lettres sans accent, chiffres, tiret ou souligné.';
  end if;
  update public.compte set pseudo = p_pseudo where id = auth.uid() and etat = 'en_attente';
  if not found then
    raise exception 'Ton pseudo ne se change plus : il est figé une fois ton compte actif.';
  end if;
exception
  when unique_violation then
    raise exception 'Ce pseudo est déjà pris.';
end
$$;

-- Campagnes du Boss (story 2.1) -----------------------------------------------------------------

-- Gardes (AD-1, AD-3, AD-10) : appelées par les RPC du Boss, après le verrou de la ligne. Être Boss, c'est boss_id = auth.uid().
create function public.est_boss(p_campagne uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (select 1 from public.campagne where id = p_campagne and boss_id = auth.uid())
$$;

-- Vivante : non bloquée et échéance non passée. L'échéance court aussi pendant un blocage (AD-10).
create function public.campagne_vivante(p_campagne uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (select 1 from public.campagne where id = p_campagne and bloquee_le is null and now() <= date_resultats)
$$;

-- Graphe des transitions (AD-2), quel que soit l'écrivain, rôle de service compris : une campagne naît brouillon ; expiree
-- s'atteint depuis toute étape avant publiee. La suppression d'un brouillon passe par supprimer_brouillon.
create function public.garder_transition()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.statut <> 'brouillon' then
      raise exception 'Une campagne naît en brouillon.';
    end if;
  elsif new.statut is distinct from old.statut and (old.statut, new.statut) not in (
    ('brouillon', 'ouverte'), ('ouverte', 'deliberation'), ('deliberation', 'prete'), ('prete', 'publiee'), ('publiee', 'archivee'),
    ('brouillon', 'expiree'), ('ouverte', 'expiree'), ('deliberation', 'expiree'), ('prete', 'expiree')
  ) then
    raise exception 'Transition de statut interdite.';
  end if;
  return new;
end
$$;
create trigger campagne_transition before insert or update of statut on public.campagne
  for each row execute function public.garder_transition();

-- Contrôle des réglages, commun à creer_campagne et modifier_campagne : messages clairs avant les contraintes de la table,
-- qui restent le dernier mot. Bornes de 30 et 15 jours comptées à l'heure de Paris, comme les contraintes. Les textes
-- sont contrôlés une fois débarrassés des blancs de bord (espace, tabulation, retours, espace insécable), comme ils sont
-- enregistrés.
create function public.verifier_reglages(p_titre text, p_theme text, p_brief text, p_langages text[], p_visibilite text,
  p_role_boss text, p_max_participants integer, p_ouverture timestamptz, p_cloture timestamptz, p_resultats timestamptz)
returns void
language plpgsql set search_path = ''
as $$
begin
  if char_length(btrim(p_titre, E' \t\r\n\u00a0')) not between 1 and 120 or p_titre is null then
    raise exception 'Le titre fait 1 à 120 caractères.';
  end if;
  if char_length(btrim(p_theme, E' \t\r\n\u00a0')) not between 1 and 200 or p_theme is null then
    raise exception 'Le thème fait 1 à 200 caractères.';
  end if;
  if char_length(btrim(p_brief, E' \t\r\n\u00a0')) not between 1 and 2000 or p_brief is null then
    raise exception 'Le brief fait 1 à 2 000 caractères.';
  end if;
  if coalesce(cardinality(p_langages), 0) not between 1 and 20
    or exists (select 1 from unnest(p_langages) l where l is null or char_length(btrim(l, E' \t\r\n\u00a0')) not between 1 and 40) then
    raise exception 'Indique de 1 à 20 langages, de 40 caractères au plus chacun.';
  end if;
  if p_visibilite is null or p_visibilite not in ('publique', 'invitation') then
    raise exception 'La visibilité est publique ou sur invitation.';
  end if;
  if p_role_boss is null or p_role_boss not in ('juge', 'joueur') then
    raise exception 'Ton rôle est juge ou joueur.';
  end if;
  if p_max_participants is null or p_max_participants not between 1 and 10 then
    raise exception 'Le nombre de places va de 1 à 10.';
  end if;
  if p_ouverture is null or p_cloture is null or p_resultats is null
    or exists (select 1 from unnest(array[p_ouverture, p_cloture, p_resultats]) d
      where extract(year from d at time zone 'Europe/Paris') not between 2000 and 2100) then
    raise exception 'Les trois dates sont obligatoires, entre 2000 et 2100.';
  end if;
  if not (p_ouverture < p_cloture and p_cloture < p_resultats) then
    raise exception 'Les dates se suivent : ouverture des inscriptions, clôture du dépôt, puis résultats.';
  end if;
  if p_cloture at time zone 'Europe/Paris' > (p_ouverture at time zone 'Europe/Paris') + interval '30 days' then
    raise exception 'La clôture du dépôt tombe au plus 30 jours après l''ouverture des inscriptions.';
  end if;
  if p_resultats at time zone 'Europe/Paris' > (p_cloture at time zone 'Europe/Paris') + interval '15 days' then
    raise exception 'Les résultats tombent au plus 15 jours après la clôture du dépôt.';
  end if;
  if p_resultats <= now() then
    raise exception 'La date des résultats est déjà passée.';
  end if;
end
$$;

-- Crée la campagne de l'appelant en brouillon et renvoie son slug : titre en minuscules sans accent, tirets, puis 6
-- caractères hexadécimaux aléatoires. Une seule campagne active par Boss : l'index unique partiel tranche, même entre deux
-- appels simultanés. Pas de ligne à verrouiller ni de campagne_vivante ici : la campagne n'existe pas encore. Un brouillon
-- échu de l'appelant, que la garde campagne_vivante empêche de supprimer, passe d'abord en expiree (arête d'AD-2) pour ne
-- pas garder la place active ; bloqué, il reste tel quel (AD-10). Les autres étapes échues relèvent de la tâche quotidienne.
-- Exécutable par authenticated (PostgREST l'expose) : toutes les règles vivent ici.
create function public.creer_campagne(p_titre text, p_theme text, p_brief text, p_langages text[], p_visibilite text,
  p_role_boss text, p_max_participants integer, p_ouverture_inscriptions timestamptz, p_cloture_depot timestamptz,
  p_date_resultats timestamptz)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
  v_contrainte text;
begin
  if not public.compte_actif() then
    raise exception 'Seul un compte actif crée une campagne.';
  end if;
  perform public.verifier_reglages(p_titre, p_theme, p_brief, p_langages, p_visibilite, p_role_boss, p_max_participants,
    p_ouverture_inscriptions, p_cloture_depot, p_date_resultats);
  update public.campagne set statut = 'expiree'
  where boss_id = auth.uid() and statut = 'brouillon' and bloquee_le is null and now() > date_resultats;
  -- shortcut: translittération latin-1 seulement (œ, æ, ß, ł, š… deviennent un tiret), passer à unaccent si les titres l'exigent.
  v_base := trim(both '-' from left(trim(both '-' from regexp_replace(
    translate(lower(p_titre), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '[^a-z0-9]+', '-', 'g')), 50));
  -- Un titre sans lettre latine ni chiffre donne un slug fait du seul suffixe.
  v_slug := concat_ws('-', nullif(v_base, ''), left(replace(gen_random_uuid()::text, '-', ''), 6));
  insert into public.campagne (slug, boss_id, titre, theme, brief, langages, visibilite, role_boss, max_participants,
    ouverture_inscriptions, cloture_depot, date_resultats)
  values (v_slug, auth.uid(), btrim(p_titre, E' \t\r\n\u00a0'), btrim(p_theme, E' \t\r\n\u00a0'), btrim(p_brief, E' \t\r\n\u00a0'),
    array(select btrim(l, E' \t\r\n\u00a0') from unnest(p_langages) l), p_visibilite, p_role_boss, p_max_participants,
    p_ouverture_inscriptions, p_cloture_depot, p_date_resultats);
  return v_slug;
exception
  when unique_violation then
    get stacked diagnostics v_contrainte = constraint_name;
    if v_contrainte = 'campagne_active_unique' then
      raise exception 'Tu as déjà une campagne en cours : une seule à la fois.';
    end if;
    raise exception 'La création a échoué. Réessaie.';
end
$$;

-- Modifie les réglages d'une campagne en brouillon ou ouverte tant que les règles ne sont pas figées (premier dépôt).
-- Campagne absente ou appelant qui n'en est pas le Boss : « Campagne introuvable. » en CT404, que le site change en 404.
create function public.modifier_campagne(p_campagne uuid, p_titre text, p_theme text, p_brief text, p_langages text[],
  p_visibilite text, p_role_boss text, p_max_participants integer, p_ouverture_inscriptions timestamptz,
  p_cloture_depot timestamptz, p_date_resultats timestamptz)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_statut text;
  v_figees timestamptz;
begin
  select statut, regles_figees_le into v_statut, v_figees from public.campagne where id = p_campagne for update;
  if not found or not public.est_boss(p_campagne) then
    raise exception 'Campagne introuvable.' using errcode = 'CT404';
  end if;
  if not public.campagne_vivante(p_campagne) then
    raise exception 'Cette campagne est bloquée ou échue : elle ne se modifie plus.';
  end if;
  if not public.compte_actif() then
    raise exception 'Ton compte n''est pas actif.';
  end if;
  if v_statut not in ('brouillon', 'ouverte') or v_figees is not null then
    raise exception 'Les règles sont figées : la campagne ne se modifie plus.';
  end if;
  perform public.verifier_reglages(p_titre, p_theme, p_brief, p_langages, p_visibilite, p_role_boss, p_max_participants,
    p_ouverture_inscriptions, p_cloture_depot, p_date_resultats);
  update public.campagne set titre = btrim(p_titre, E' \t\r\n\u00a0'), theme = btrim(p_theme, E' \t\r\n\u00a0'), brief = btrim(p_brief, E' \t\r\n\u00a0'),
    langages = array(select btrim(l, E' \t\r\n\u00a0') from unnest(p_langages) l), visibilite = p_visibilite, role_boss = p_role_boss,
    max_participants = p_max_participants, ouverture_inscriptions = p_ouverture_inscriptions,
    cloture_depot = p_cloture_depot, date_resultats = p_date_resultats
  where id = p_campagne;
end
$$;

-- Supprime un brouillon de l'appelant ; toute autre étape refuse (AD-2). Un brouillon échu ne se supprime pas (garde
-- campagne_vivante) : creer_campagne le fait passer en expiree.
create function public.supprimer_brouillon(p_campagne uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_statut text;
begin
  select statut into v_statut from public.campagne where id = p_campagne for update;
  if not found or not public.est_boss(p_campagne) then
    raise exception 'Campagne introuvable.' using errcode = 'CT404';
  end if;
  if not public.campagne_vivante(p_campagne) then
    raise exception 'Cette campagne est bloquée ou échue : elle ne se supprime plus.';
  end if;
  if not public.compte_actif() then
    raise exception 'Ton compte n''est pas actif.';
  end if;
  if v_statut <> 'brouillon' then
    raise exception 'Seul un brouillon se supprime.';
  end if;
  delete from public.campagne where id = p_campagne;
end
$$;

-- Ouverture et lecture publique (story 2.2) ----------------------------------------------------------

-- Ouvre un brouillon de l'appelant (AD-2) : il devient visible selon sa visibilité. « Brouillon complet » = ce que tiennent
-- déjà verifier_reglages et les contraintes de la table : rien d'autre à revérifier, sauf la clôture des dépôts, qui doit
-- être à venir. Mêmes gardes, dans le même ordre, que modifier_campagne.
create function public.ouvrir_campagne(p_campagne uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_statut text;
  v_cloture timestamptz;
begin
  select statut, cloture_depot into v_statut, v_cloture from public.campagne where id = p_campagne for update;
  if not found or not public.est_boss(p_campagne) then
    raise exception 'Campagne introuvable.' using errcode = 'CT404';
  end if;
  if not public.campagne_vivante(p_campagne) then
    raise exception 'Cette campagne est bloquée ou échue : elle ne s''ouvre plus.';
  end if;
  if not public.compte_actif() then
    raise exception 'Ton compte n''est pas actif.';
  end if;
  if v_statut <> 'brouillon' then
    raise exception 'Seul un brouillon s''ouvre.';
  end if;
  if v_cloture <= now() then
    raise exception 'La clôture des dépôts est déjà passée.';
  end if;
  update public.campagne set statut = 'ouverte' where id = p_campagne;
end
$$;

-- Campagne vue du public (AD-1, AD-2, AD-10, AD-13) : vue du calculé, avec les droits de son propriétaire (security_invoker
-- = false), si bien que la visibilité se tient ici et nulle part ailleurs. Visible : ni bloquée, ni brouillon, ni expirée,
-- et publique ou dont l'appelant est le Boss (la story 2.4 ajoutera « ou inscrit »). Ni boss_id ni motif_blocage ; le Boss
-- est dit par son pseudo, seule donnée publique d'un compte.
-- Phase d'une campagne ouverte : pas de fin d'inscription distincte, inscription et dépôt sont ouverts ensemble (SPECS § 3).
create view public.campagne_phase with (security_invoker = false) as
select c.id, c.slug, c.titre, c.theme, c.brief, c.langages, c.visibilite, c.role_boss, c.max_participants,
  c.ouverture_inscriptions, c.cloture_depot, c.date_resultats, c.statut,
  case
    when c.statut <> 'ouverte' then c.statut
    when now() < c.ouverture_inscriptions then 'a_venir'
    when now() < c.cloture_depot then 'inscriptions'
    else 'depots_clos'
  end as phase,
  b.pseudo as boss_pseudo
from public.campagne c
join public.compte b on b.id = c.boss_id
where c.bloquee_le is null and c.statut not in ('brouillon', 'expiree')
  and (c.visibilite = 'publique' or c.boss_id = (select auth.uid()));
