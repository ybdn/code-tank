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
-- Une campagne sur invitation reçoit son lien secret (story 2.4) : 256 bits de pgcrypto en hexadécimal.
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
    ouverture_inscriptions, cloture_depot, date_resultats, jeton_invitation)
  values (v_slug, auth.uid(), btrim(p_titre, E' \t\r\n\u00a0'), btrim(p_theme, E' \t\r\n\u00a0'), btrim(p_brief, E' \t\r\n\u00a0'),
    array(select btrim(l, E' \t\r\n\u00a0') from unnest(p_langages) l), p_visibilite, p_role_boss, p_max_participants,
    p_ouverture_inscriptions, p_cloture_depot, p_date_resultats,
    case when p_visibilite = 'invitation' then encode(extensions.gen_random_bytes(32), 'hex') end);
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
-- Lien d'invitation (story 2.4) : posé au passage sur invitation, gardé tant qu'elle le reste, retiré au passage en publique.
create function public.modifier_campagne(p_campagne uuid, p_titre text, p_theme text, p_brief text, p_langages text[],
  p_visibilite text, p_role_boss text, p_max_participants integer, p_ouverture_inscriptions timestamptz,
  p_cloture_depot timestamptz, p_date_resultats timestamptz)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_statut text;
  v_figees timestamptz;
  v_visibilite text;
begin
  select statut, regles_figees_le, visibilite into v_statut, v_figees, v_visibilite from public.campagne where id = p_campagne for update;
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
  -- Inscrits (story 2.3) : jamais plus d'inscrits que de places, jamais de Boss juge inscrit à sa campagne, et la
  -- visibilité figée dès le premier inscrit (passée sur invitation, la campagne échapperait à ses inscrits).
  if p_visibilite <> v_visibilite and exists (select 1 from public.participation where campagne_id = p_campagne and etat = 'inscrit') then
    raise exception 'La visibilité ne change plus une fois qu''il y a des inscrits.';
  end if;
  if p_max_participants < (select count(*) from public.participation where campagne_id = p_campagne and etat = 'inscrit') then
    raise exception 'Il y a déjà plus d''inscrits que ce nombre de places.';
  end if;
  if p_role_boss = 'juge' and exists (select 1 from public.participation
    where campagne_id = p_campagne and compte_id = auth.uid() and etat = 'inscrit') then
    raise exception 'Tu es inscrit à ta campagne : désinscris-toi avant d''en devenir le juge.';
  end if;
  update public.campagne set titre = btrim(p_titre, E' \t\r\n\u00a0'), theme = btrim(p_theme, E' \t\r\n\u00a0'), brief = btrim(p_brief, E' \t\r\n\u00a0'),
    langages = array(select btrim(l, E' \t\r\n\u00a0') from unnest(p_langages) l), visibilite = p_visibilite, role_boss = p_role_boss,
    max_participants = p_max_participants, ouverture_inscriptions = p_ouverture_inscriptions,
    cloture_depot = p_cloture_depot, date_resultats = p_date_resultats,
    jeton_invitation = case when p_visibilite = 'invitation' then coalesce(jeton_invitation, encode(extensions.gen_random_bytes(32), 'hex')) end
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

-- Campagne calculée (AD-1, AD-2, AD-10, AD-13) : vue du calculé, avec les droits de son propriétaire (security_invoker =
-- false), pour campagne_phase et lire_invitation seules ; aucun client ne la lit (elle porte boss_id et le jeton). Hors
-- d'elle : bloquées, brouillons, expirées.
-- Phase d'une campagne ouverte : pas de fin d'inscription distincte, inscription et dépôt sont ouverts ensemble (SPECS § 3).
create view public.campagne_calculee with (security_invoker = false) as
select c.id, c.slug, c.titre, c.theme, c.brief, c.langages, c.visibilite, c.role_boss, c.max_participants,
  c.ouverture_inscriptions, c.cloture_depot, c.date_resultats, c.statut,
  -- Calculé, jamais stocké (story 2.3) : la vue lit participation avec les droits de son propriétaire.
  -- shortcut: une participation dont le compte est supprimé garde sa place ; la story 6.4 (suppression de compte, AD-11) la retire.
  c.max_participants - (select count(*) from public.participation p where p.campagne_id = c.id and p.etat = 'inscrit')::integer
    as places_restantes,
  case
    when c.statut <> 'ouverte' then c.statut
    when now() < c.ouverture_inscriptions then 'a_venir'
    when now() < c.cloture_depot then 'inscriptions'
    else 'depots_clos'
  end as phase,
  b.pseudo as boss_pseudo,
  c.boss_id, c.jeton_invitation
from public.campagne c
join public.compte b on b.id = c.boss_id
where c.bloquee_le is null and c.statut not in ('brouillon', 'expiree');

-- Campagne vue du public : la visibilité se tient ici et nulle part ailleurs. Visible : publique, ou dont l'appelant est le
-- Boss, ou à laquelle il est inscrit (story 2.4 ; un inscrit retiré ne la voit plus). Ni boss_id, ni motif_blocage, ni le
-- jeton d'invitation ; le Boss est dit par son pseudo, seule donnée publique d'un compte.
create view public.campagne_phase with (security_invoker = false) as
select v.id, v.slug, v.titre, v.theme, v.brief, v.langages, v.visibilite, v.role_boss, v.max_participants,
  v.ouverture_inscriptions, v.cloture_depot, v.date_resultats, v.statut, v.places_restantes, v.phase, v.boss_pseudo
from public.campagne_calculee v
where v.visibilite = 'publique' or v.boss_id = (select auth.uid())
  or exists (select 1 from public.participation p where p.campagne_id = v.id and p.compte_id = (select auth.uid()) and p.etat = 'inscrit');


-- Inscription et désinscription (story 2.3) ---------------------------------------------------------------

-- Inscrit l'appelant à une campagne publique en phase d'inscription (AD-1, AD-2, SPECS § 3 et § 9) : premier arrivé, premier
-- servi, sous le verrou de la ligne campagne, si bien que deux inscriptions simultanées ne dépassent jamais les places. Un
-- brouillon, une campagne expirée ou bloquée répondent « introuvable ». Une campagne sur invitation aussi (story 2.4), sauf
-- avec son jeton exact (le lien secret), pour son Boss ou pour un inscrit, comme campagne_phase ; une campagne publique
-- ignore le jeton. Le jeton ne figure dans aucun message. Un Boss juge ne s'inscrit pas à sa campagne ; un Boss joueur y occupe une place. Exécutable par authenticated (PostgREST
-- l'expose) : toutes les règles vivent ici, limite de débit par compte comprise.
create function public.sinscrire(p_campagne uuid, p_connaissance boolean, p_jeton text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.campagne%rowtype;
begin
  select * into v_c from public.campagne where id = p_campagne for update;
  if not found or v_c.statut in ('brouillon', 'expiree') or v_c.bloquee_le is not null
    or (v_c.visibilite = 'invitation' and v_c.boss_id is distinct from auth.uid() and p_jeton is distinct from v_c.jeton_invitation
      and not exists (select 1 from public.participation where campagne_id = p_campagne and compte_id = auth.uid() and etat = 'inscrit')) then
    raise exception 'Campagne introuvable.' using errcode = 'CT404';
  end if;
  if not public.campagne_vivante(p_campagne) then
    raise exception 'Cette campagne est échue : on ne s''y inscrit plus.';
  end if;
  if not public.compte_actif() then
    raise exception 'Ton compte n''est pas actif.';
  end if;
  if v_c.statut <> 'ouverte' or now() < v_c.ouverture_inscriptions or now() >= v_c.cloture_depot then
    raise exception 'Les inscriptions ne sont pas ouvertes.';
  end if;
  if v_c.boss_id = auth.uid() and v_c.role_boss = 'juge' then
    raise exception 'Tu juges cette campagne : tu ne t''y inscris pas.';
  end if;
  if p_connaissance is not true then
    raise exception 'Coche la case : ton code sera envoyé à Anthropic.';
  end if;
  if exists (select 1 from public.participation where campagne_id = p_campagne and compte_id = auth.uid() and etat = 'inscrit') then
    raise exception 'Tu es déjà inscrit.';
  end if;
  if (select count(*) from public.participation where campagne_id = p_campagne and etat = 'inscrit') >= v_c.max_participants then
    raise exception 'La campagne est complète.';
  end if;
  -- Limite par compte (AD-1) : 20 inscriptions réussies par 24 h, sous l'empreinte SHA-256 de l'id (debit.empreinte exige
  -- 64 caractères hexadécimaux). Elle borne les allers-retours inscription et désinscription.
  if public.consommer_debit(encode(sha256(convert_to(auth.uid()::text || ':compte', 'UTF8')), 'hex'), 'inscription', 20, 86400) > 0 then
    raise exception 'Trop d''inscriptions depuis ton compte. Réessaie plus tard.' using errcode = 'CT429';
  end if;
  insert into public.participation (campagne_id, compte_id, connaissance_envoi_le)
  values (p_campagne, auth.uid(), now())
  on conflict (campagne_id, compte_id) do update
    set etat = 'inscrit', connaissance_envoi_le = now(), inscrit_le = now(), retire_le = null;
end
$$;

-- Désinscrit l'appelant tant que la délibération n'a pas commencé (statut ouverte) et qu'il n'a ni dépôt ni réception en
-- attente : sa ligne passe à retire et sa place se libère. Mêmes gardes, dans le même ordre, que sinscrire (sans jeton : sur invitation, l'inscrit et le Boss voient la
-- campagne) ; pas de limite de débit (sinscrire borne déjà les allers-retours).
create function public.se_desinscrire(p_campagne uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.campagne%rowtype;
begin
  select * into v_c from public.campagne where id = p_campagne for update;
  if not found or v_c.statut in ('brouillon', 'expiree') or v_c.bloquee_le is not null
    or (v_c.visibilite = 'invitation' and v_c.boss_id is distinct from auth.uid()
      and not exists (select 1 from public.participation where campagne_id = p_campagne and compte_id = auth.uid() and etat = 'inscrit')) then
    raise exception 'Campagne introuvable.' using errcode = 'CT404';
  end if;
  if not public.campagne_vivante(p_campagne) then
    raise exception 'Cette campagne est échue : on ne s''en désinscrit plus.';
  end if;
  if not public.compte_actif() then
    raise exception 'Ton compte n''est pas actif.';
  end if;
  if v_c.statut <> 'ouverte' then
    raise exception 'La délibération a commencé : tu ne peux plus te désinscrire.';
  end if;
  -- Un dépôt appartient à un inscrit (story 3.3) : il se retire d'abord, par retirer_depot qui rend ses archives à effacer,
  -- ce qui n'est possible qu'avant la clôture et hors contrôle en cours.
  if exists (select 1 from public.reception r join public.participation p on p.id = r.participation_id
    where p.campagne_id = p_campagne and p.compte_id = auth.uid() and r.statut = 'en_attente') then
    raise exception 'Ton dépôt est en cours de contrôle : attends son résultat pour te désinscrire.';
  end if;
  if exists (select 1 from public.depot d join public.participation p on p.id = d.participation_id
    where p.campagne_id = p_campagne and p.compte_id = auth.uid()) then
    if now() >= v_c.cloture_depot then
      raise exception 'Le dépôt est clos : tu ne peux plus te désinscrire.';
    end if;
    raise exception 'Retire d''abord ton dépôt pour te désinscrire.';
  end if;
  update public.participation set etat = 'retire', retire_le = now()
  where campagne_id = p_campagne and compte_id = auth.uid() and etat = 'inscrit';
  if not found then
    raise exception 'Tu n''es pas inscrit à cette campagne.';
  end if;
  -- Une réception refusée ne survit pas au départ : sa présentation reviendrait à la réinscription. Son zip a été effacé
  -- par prive au refus (story 3.4).
  delete from public.reception r using public.participation p
  where p.id = r.participation_id and p.campagne_id = p_campagne and p.compte_id = auth.uid();
end
$$;


-- Invitation (story 2.4) -------------------------------------------------------------------------------------------

-- Campagne d'un lien d'invitation, pour un compte connecté : mêmes colonnes que campagne_phase, jeton jamais rendu. Jeton
-- hors forme ou inconnu, campagne bloquée, brouillon ou expirée : « Campagne introuvable. » en CT404, message fixe.
-- Pas de limite de débit : 256 bits aléatoires ne se devinent pas par essais.
create function public.lire_invitation(p_jeton text)
returns setof public.campagne_phase
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
  select v.id, v.slug, v.titre, v.theme, v.brief, v.langages, v.visibilite, v.role_boss, v.max_participants,
    v.ouverture_inscriptions, v.cloture_depot, v.date_resultats, v.statut, v.places_restantes, v.phase, v.boss_pseudo
  from public.campagne_calculee v
  where p_jeton ~ '^[0-9a-f]{64}$' and v.jeton_invitation = p_jeton;
  if not found then
    raise exception 'Campagne introuvable.' using errcode = 'CT404';
  end if;
end
$$;

-- Nouveau lien pour une campagne sur invitation de l'appelant : l'ancien n'ouvre plus rien, les inscrits gardent leur accès
-- (campagne_phase les voit par leur participation). Mêmes gardes, dans le même ordre, que modifier_campagne. Rend le jeton.
create function public.regenerer_invitation(p_campagne uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_visibilite text;
  v_jeton text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select visibilite into v_visibilite from public.campagne where id = p_campagne for update;
  if not found or not public.est_boss(p_campagne) then
    raise exception 'Campagne introuvable.' using errcode = 'CT404';
  end if;
  if not public.campagne_vivante(p_campagne) then
    raise exception 'Cette campagne est bloquée ou échue : son lien ne change plus.';
  end if;
  if not public.compte_actif() then
    raise exception 'Ton compte n''est pas actif.';
  end if;
  if v_visibilite <> 'invitation' then
    raise exception 'Seule une campagne sur invitation a un lien.';
  end if;
  update public.campagne set jeton_invitation = v_jeton where id = p_campagne;
  return v_jeton;
end
$$;


-- Dépôt (story 3.3) ------------------------------------------------------------------------------------------------

-- Participation de l'appelant s'il peut déposer maintenant dans la campagne, sinon le refus de deposer. Mêmes gardes,
-- dans le même ordre, que se_desinscrire, puis la phase de dépôt (mêmes bornes que sinscrire) et le Boss juge (un Boss
-- joueur inscrit dépose, SPECS § 2), puis la réception en attente. Sans verrou : la route d'URL d'envoi la lit pour ne pas signer un envoi voué au refus,
-- deposer la rappelle sous le verrou de la campagne. Exécutable par authenticated : elle ne rend que l'id de sa propre
-- participation.
create function public.peut_deposer(p_campagne uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_c public.campagne%rowtype;
  v_participation uuid;
begin
  select * into v_c from public.campagne where id = p_campagne;
  select id into v_participation from public.participation where campagne_id = p_campagne and compte_id = auth.uid() and etat = 'inscrit';
  if v_c.id is null or v_c.statut in ('brouillon', 'expiree') or v_c.bloquee_le is not null
    or (v_c.visibilite = 'invitation' and v_c.boss_id is distinct from auth.uid() and v_participation is null) then
    raise exception 'Campagne introuvable.' using errcode = 'CT404';
  end if;
  if not public.campagne_vivante(p_campagne) then
    raise exception 'Cette campagne est échue : on n''y dépose plus.';
  end if;
  if not public.compte_actif() then
    raise exception 'Ton compte n''est pas actif.';
  end if;
  if now() >= v_c.cloture_depot then
    raise exception 'La date limite de dépôt est passée.';
  end if;
  if v_c.statut <> 'ouverte' or now() < v_c.ouverture_inscriptions then
    raise exception 'Le dépôt n''est pas ouvert.';
  end if;
  if v_c.boss_id = auth.uid() and v_c.role_boss = 'juge' then
    raise exception 'Tu juges cette campagne : tu n''y déposes pas.';
  end if;
  if v_participation is null then
    raise exception 'Tu n''es pas inscrit à cette campagne.';
  end if;
  -- Pas d'envoi pendant qu'un autre attend son contrôle : il serait refusé et resterait dans le bucket.
  if exists (select 1 from public.reception where participation_id = v_participation and statut = 'en_attente') then
    raise exception 'Ton dépôt précédent est en cours de contrôle.';
  end if;
  return v_participation;
end
$$;

-- Dépose le zip déjà envoyé au chemin p_chemin (AD-1, AD-2, SPECS § 4) : crée la réception en_attente que prive contrôlera
-- (story 3.4), ou remplace une réception refusée. Sous le verrou de la campagne, avec les gardes de peut_deposer. Le chemin
-- doit être celui que la route a signé pour cette participation et l'objet doit être arrivé dans le bucket ; un chemin déjà
-- porté par une réception ou un dépôt est refusé. Textes rognés de leurs blancs de bord ; demande vide : aucune. Le premier
-- dépôt de la campagne fige ses règles et le rôle du Boss. Exécutable par authenticated (PostgREST l'expose) : toutes les
-- règles vivent ici, limite de débit par compte comprise.
-- shortcut: l'archive d'une réception refusée est effacée par prive au refus ; si cet effacement a échoué, elle reste dans le
-- bucket une fois la réception remplacée, jusqu'à objets_abandonnes (AD-11, epic 6).
create function public.deposer(p_campagne uuid, p_chemin text, p_presentation text, p_demande text, p_droit_declare boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_participation uuid;
  v_presentation text := btrim(p_presentation, E' \t\r\n\u00a0');
  v_demande text := nullif(btrim(p_demande, E' \t\r\n\u00a0'), '');
begin
  perform 1 from public.campagne where id = p_campagne for update;
  v_participation := public.peut_deposer(p_campagne);
  if p_droit_declare is not true then
    raise exception 'Coche la case : tu dois avoir le droit de déposer ce code.';
  end if;
  if v_presentation is null or char_length(v_presentation) not between 1 and 500 then
    raise exception 'La présentation fait entre 1 et 500 caractères.';
  end if;
  if char_length(v_demande) > 80 then
    raise exception 'La demande fait 80 caractères au plus.';
  end if;
  if p_chemin is null
    or p_chemin !~ ('^' || p_campagne || '/' || v_participation || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.zip$')
    or not exists (select 1 from storage.objects where bucket_id = 'depots' and name = p_chemin)
    or exists (select 1 from public.reception where chemin_stockage = p_chemin)
    or exists (select 1 from public.depot where chemin_stockage = p_chemin) then
    raise exception 'Ton archive n''est pas arrivée : recommence l''envoi.';
  end if;
  -- Limite par compte (AD-1) : 10 dépôts par 24 h, sous l'empreinte SHA-256 de l'id, comme sinscrire.
  if public.consommer_debit(encode(sha256(convert_to(auth.uid()::text || ':compte', 'UTF8')), 'hex'), 'depot', 10, 86400) > 0 then
    raise exception 'Trop de dépôts depuis ton compte. Réessaie plus tard.' using errcode = 'CT429';
  end if;
  insert into public.reception (participation_id, chemin_stockage, presentation, demande, droit_declare_le)
  values (v_participation, p_chemin, v_presentation, v_demande, now())
  on conflict (participation_id) do update
    set chemin_stockage = excluded.chemin_stockage, presentation = excluded.presentation, demande = excluded.demande,
      droit_declare_le = excluded.droit_declare_le, statut = 'en_attente', motifs = null, tentatives = 0, cree_le = now();
  update public.campagne set regles_figees_le = coalesce(regles_figees_le, now()) where id = p_campagne;
end
$$;

-- Chemins de stockage d'un dépôt : le zip et l'archive filtrée (AD-11). Seul chemin d'effacement des archives : l'appelant
-- efface ce qu'elle rend. Réservée au rôle de service ; retirer_depot l'appelle avec les droits de son propriétaire.
create function public.effacer_archives(d public.depot)
returns text[]
language sql immutable set search_path = ''
as $$
  select array_remove(array[d.chemin_stockage, d.chemin_filtre], null)
$$;

-- Retire le dépôt de l'appelant avant la délibération (statut ouverte, avant la clôture), sous le verrou de la campagne, et
-- rend les chemins à effacer (effacer_archives) : la route les efface du bucket. Mêmes gardes, dans le même ordre, que
-- se_desinscrire. Refusé tant qu'une réception attend son contrôle (prive pourrait l'accepter juste après). L'inscription
-- reste : le candidat peut redéposer.
create function public.retirer_depot(p_campagne uuid)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.campagne%rowtype;
  v_depot public.depot%rowtype;
begin
  select * into v_c from public.campagne where id = p_campagne for update;
  if not found or v_c.statut in ('brouillon', 'expiree') or v_c.bloquee_le is not null
    or (v_c.visibilite = 'invitation' and v_c.boss_id is distinct from auth.uid()
      and not exists (select 1 from public.participation where campagne_id = p_campagne and compte_id = auth.uid() and etat = 'inscrit')) then
    raise exception 'Campagne introuvable.' using errcode = 'CT404';
  end if;
  if not public.campagne_vivante(p_campagne) then
    raise exception 'Cette campagne est échue : on n''y retire plus de dépôt.';
  end if;
  if not public.compte_actif() then
    raise exception 'Ton compte n''est pas actif.';
  end if;
  if v_c.statut <> 'ouverte' or now() >= v_c.cloture_depot then
    raise exception 'Le dépôt est clos : tu ne peux plus le retirer.';
  end if;
  if exists (select 1 from public.reception r join public.participation p on p.id = r.participation_id
    where p.campagne_id = p_campagne and p.compte_id = auth.uid() and r.statut = 'en_attente') then
    raise exception 'Ton dépôt est en cours de contrôle : attends son résultat pour le retirer.';
  end if;
  delete from public.depot d using public.participation p
  where p.id = d.participation_id and p.campagne_id = p_campagne and p.compte_id = auth.uid()
  returning d.* into v_depot;
  if not found then
    raise exception 'Tu n''as pas de dépôt dans cette campagne.' using errcode = 'CT404';
  end if;
  return public.effacer_archives(v_depot);
end
$$;


-- Contrôle des réceptions par prive (story 3.4) -------------------------------------------------------------------------
-- Réservées au rôle de service (AD-1) ; chacune verrouille d'abord la ligne campagne (AD-2), comme deposer et retirer_depot.
-- Une réception en_attente ne change pas sous prive : deposer, retirer_depot et se_desinscrire la refusent tant qu'elle attend.

-- Compte un essai de contrôle avant qu'il commence ; rend le nouveau nombre, ou null si la réception n'attend plus.
create function public.noter_tentative_reception(p_reception uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_tentatives integer;
begin
  perform 1 from public.campagne c join public.participation p on p.campagne_id = c.id
    join public.reception r on r.participation_id = p.id where r.id = p_reception for update of c;
  update public.reception set tentatives = tentatives + 1 where id = p_reception and statut = 'en_attente'
  returning tentatives into v_tentatives;
  return v_tentatives;
end
$$;

-- Refuse une réception en attente avec ses motifs ([{ code, message }], message lu par le candidat) et rend son chemin, que
-- prive efface (SPECS § 4 : on ne garde pas le fichier) ; null si elle n'attendait plus : rien à faire.
create function public.refuser_reception(p_reception uuid, p_motifs jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_chemin text;
begin
  if jsonb_typeof(p_motifs) is distinct from 'array' or jsonb_array_length(p_motifs) = 0 then
    raise exception 'Motifs de refus mal formés.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_motifs) m
    where jsonb_typeof(m -> 'code') is distinct from 'string' or jsonb_typeof(m -> 'message') is distinct from 'string') then
    raise exception 'Motifs de refus mal formés.';
  end if;
  perform 1 from public.campagne c join public.participation p on p.campagne_id = c.id
    join public.reception r on r.participation_id = p.id where r.id = p_reception for update of c;
  update public.reception set statut = 'refusee', motifs = p_motifs where id = p_reception and statut = 'en_attente'
  returning chemin_stockage into v_chemin;
  return v_chemin;
end
$$;

-- Accepte une réception en attente (SPECS § 4, AD-6, AD-11) : crée le dépôt de la participation, ou remplace l'ancien, avec
-- ce que prive a mesuré et ce que le candidat a déclaré (recopié de la réception), puis supprime la réception. Rend les
-- chemins de l'ancien dépôt (effacer_archives), que prive efface ; vide sans ancien dépôt. Le zip déposé reste
-- (chemin_stockage, sha256 est son empreinte) avec l'archive filtrée, déjà écrite par prive à côté de lui.
-- Refusée si la campagne n'est plus ouverte, vivante et non bloquée : rien ne change sous une délibération ou une modération.
create function public.accepter_depot(p_reception uuid, p_chemin_filtre text, p_sha256 text, p_nb_fichiers integer,
  p_fichiers_exclus jsonb, p_nb_tokens_estime integer, p_faits jsonb, p_note_outillage integer, p_alerte_manipulation boolean,
  p_alertes_integrite jsonb)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.campagne%rowtype;
  v_r public.reception%rowtype;
  v_ancien public.depot%rowtype;
begin
  select c.* into v_c from public.campagne c join public.participation p on p.campagne_id = c.id
    join public.reception r on r.participation_id = p.id where r.id = p_reception for update of c;
  select * into v_r from public.reception where id = p_reception and statut = 'en_attente';
  if not found then
    raise exception 'Réception introuvable ou déjà traitée.' using errcode = 'CT404';
  end if;
  if v_c.statut <> 'ouverte' or not public.campagne_vivante(v_c.id) then
    raise exception 'La campagne n''accepte plus de dépôt.' using errcode = 'CT409';
  end if;
  -- L'archive filtrée est celle de ce zip (même nom, suffixe .filtre.zip) et doit être arrivée dans le bucket.
  if p_chemin_filtre is distinct from regexp_replace(v_r.chemin_stockage, '\.zip$', '.filtre.zip')
    or not exists (select 1 from storage.objects where bucket_id = 'depots' and name = p_chemin_filtre) then
    raise exception 'Archive filtrée absente.';
  end if;
  delete from public.depot where participation_id = v_r.participation_id returning * into v_ancien;
  insert into public.depot (participation_id, chemin_stockage, chemin_filtre, sha256, nb_fichiers, fichiers_exclus,
    nb_tokens_estime, faits, note_outillage, alerte_manipulation, alertes_integrite, presentation, demande, droit_declare_le)
  values (v_r.participation_id, v_r.chemin_stockage, p_chemin_filtre, p_sha256, p_nb_fichiers, p_fichiers_exclus,
    p_nb_tokens_estime, p_faits, p_note_outillage, p_alerte_manipulation, p_alertes_integrite, v_r.presentation, v_r.demande,
    v_r.droit_declare_le);
  delete from public.reception where id = p_reception;
  return case when v_ancien.id is null then '{}'::text[] else public.effacer_archives(v_ancien) end;
end
$$;
