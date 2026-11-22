-- Fonctions et déclencheurs. Toutes ont search_path vide et des noms qualifiés.
-- Les fonctions « security definer » tournent avec les droits de leur propriétaire (postgres,
-- qui contourne la RLS) : chacune contrôle donc elle-même qui l'appelle, d'après auth.uid().

create function public.est_organisateur() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.compte where id = (select auth.uid()) and role = 'organisateur')
$$;

-- Déclencheurs (les règles valent pour tous les rôles, clé de service comprise) -------------

create function public.compte_avant_ecriture() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_plafond integer;
begin
  if tg_op = 'UPDATE' and new.etat <> old.etat then
    new.etat_le := now();
  end if;

  if new.etat = 'verifie' and (tg_op = 'INSERT' or old.etat <> 'verifie') then
    -- Le verrou sérialise deux vérifications simultanées sur la dernière place. Le compte est
    -- compté ensuite, dans une instruction à part, pour voir ce que l'autre a validé.
    select plafond_comptes into v_plafond from public.reglage for update;
    if v_plafond is not null and (
      select count(*) from public.compte
      where role = 'candidat' and etat in ('verifie', 'autorise') and id <> new.id
    ) >= v_plafond then
      new.etat := 'liste_attente';
      new.etat_le := now();
    end if;
  end if;

  -- Une adresse modifiée depuis le client (identité présente) n'est plus vérifiée.
  if tg_op = 'UPDATE' and new.email_contact <> old.email_contact and auth.uid() is not null then
    new.email_verifie_le := null;
  end if;
  return new;
end
$$;

create trigger compte_avant_ecriture before insert or update on public.compte
for each row execute function public.compte_avant_ecriture();

create function public.campagne_avant_maj() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.statut <> old.statut then
    if new.statut is distinct from (enum_range(old.statut, null))[2] then
      raise exception 'Transition de statut interdite : de % à %.', old.statut, new.statut;
    end if;
    if new.statut = 'inscriptions' and (
      select coalesce(sum((c ->> 'poids')::numeric), 0) from jsonb_array_elements(new.criteres) c
    ) <> 100 then
      raise exception 'Les poids des critères doivent totaliser 100 avant l''ouverture des inscriptions.';
    end if;
  end if;

  if old.regles_figees_le is not null
    and (new.brief, new.theme, new.criteres) is distinct from (old.brief, old.theme, old.criteres) then
    raise exception 'Les règles de la campagne sont figées depuis le premier dépôt.';
  end if;
  return new;
end
$$;

create trigger campagne_avant_maj before update on public.campagne
for each row execute function public.campagne_avant_maj();

-- Le premier dépôt reçu fige les règles de sa campagne. Security definer : l'effet ne doit pas
-- dépendre des droits de celui qui écrit le dépôt.
create function public.depot_apres_insertion() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.campagne set regles_figees_le = now()
  where regles_figees_le is null
    and id = (select campagne_id from public.participation where id = new.participation_id);
  return null;
end
$$;

create trigger depot_apres_insertion after insert on public.depot
for each row execute function public.depot_apres_insertion();

create function public.vote_boss_fige() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.verrouille_le is not null then
    raise exception 'Le vote est verrouillé : il ne se modifie plus.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger vote_boss_fige before update or delete on public.vote_boss
for each row execute function public.vote_boss_fige();

-- Écritures par fonctions -------------------------------------------------------------------

create function public.decider_compte(p_compte_id uuid, p_etat public.compte_etat) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_organisateur() then
    raise exception 'Réservé à l''organisateur.' using errcode = '42501';
  end if;
  if p_etat not in ('autorise', 'refuse', 'liste_attente') then
    raise exception 'Un compte ne peut être qu''autorisé, refusé ou mis en liste d''attente.';
  end if;
  update public.compte set etat = p_etat
  where id = p_compte_id and role = 'candidat' and etat in ('verifie', 'liste_attente');
  if not found then
    raise exception 'Ce compte n''existe pas ou n''est ni vérifié ni en liste d''attente.';
  end if;
end
$$;

-- Fonction interne, sans droit d'exécution pour personne : elle partage la règle d'inscription
-- entre sinscrire et ajouter_participant.
create function public._inscrire(p_campagne_id uuid, p_compte_id uuid, p_hors_quota boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_campagne public.campagne;
  v_inscrits integer;
  v_lignes integer;
  v_places integer;
begin
  -- Le verrou sur la campagne rend le contrôle de la dernière place atomique.
  select * into v_campagne from public.campagne where id = p_campagne_id for update;
  if not found or v_campagne.statut not in ('inscriptions', 'depot') then
    raise exception 'Les inscriptions ne sont pas ouvertes pour cette campagne.';
  end if;
  if not exists (
    select 1 from public.compte where id = p_compte_id and role = 'candidat' and etat = 'autorise'
  ) then
    raise exception 'Le compte n''est pas autorisé à s''inscrire.';
  end if;

  select count(*) into v_inscrits
  from public.participation where campagne_id = p_campagne_id and etat = 'inscrit';
  v_places := v_campagne.max_participants;
  if p_hors_quota then
    v_places := v_places + 2;
  end if;
  if v_inscrits >= v_places then
    raise exception 'Il n''y a plus de place dans cette campagne.';
  end if;

  insert into public.participation (campagne_id, compte_id) values (p_campagne_id, p_compte_id)
  on conflict (campagne_id, compte_id)
  do update set etat = 'inscrit', retire_le = null, inscrit_le = now()
  where public.participation.etat = 'retire';
  get diagnostics v_lignes = row_count;
  if v_lignes = 0 then
    raise exception 'Ce compte est déjà inscrit à cette campagne.';
  end if;
end
$$;

create function public.sinscrire(p_campagne_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connecte-toi pour t''inscrire.' using errcode = '42501';
  end if;
  perform public._inscrire(p_campagne_id, auth.uid(), false);
end
$$;

-- L'organisateur peut dépasser le quota de deux places au plus.
create function public.ajouter_participant(p_campagne_id uuid, p_compte_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_organisateur() then
    raise exception 'Réservé à l''organisateur.' using errcode = '42501';
  end if;
  perform public._inscrire(p_campagne_id, p_compte_id, true);
end
$$;

create function public.se_desinscrire(p_campagne_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.participation p set etat = 'retire', retire_le = now()
  from public.campagne c
  where c.id = p.campagne_id and p.campagne_id = p_campagne_id
    and p.compte_id = (select auth.uid()) and p.etat = 'inscrit'
    and c.statut < 'deliberation';
  if not found then
    raise exception 'Désinscription impossible : tu n''es pas inscrit, ou la délibération a commencé.';
  end if;
end
$$;

create function public.verrouiller_vote(p_participation_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_organisateur() then
    raise exception 'Réservé à l''organisateur.' using errcode = '42501';
  end if;
  update public.vote_boss v set verrouille_le = now()
  from public.participation p join public.campagne c on c.id = p.campagne_id
  where p.id = v.participation_id and v.participation_id = p_participation_id
    and v.verrouille_le is null and c.statut in ('deliberation', 'prete');
  if not found then
    raise exception 'Verrouillage impossible : le vote n''existe pas, est déjà verrouillé, ou la campagne n''est pas en délibération.';
  end if;
end
$$;

create function public.masquer_replique(p_audit_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_organisateur() then
    raise exception 'Réservé à l''organisateur.' using errcode = '42501';
  end if;
  update public.audit set replique_masquee = true where id = p_audit_id;
  if not found then
    raise exception 'Audit introuvable.';
  end if;
end
$$;

create function public.enregistrer_decision(
  p_participation_id uuid, p_type public.decision_type, p_justification text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_organisateur() then
    raise exception 'Réservé à l''organisateur.' using errcode = '42501';
  end if;
  insert into public.decision (campagne_id, participation_id, type, justification)
  select campagne_id, id, p_type, p_justification from public.participation where id = p_participation_id;
  if not found then
    raise exception 'Participation introuvable.';
  end if;
  if p_type = 'fermeture_compte' then
    update public.compte set etat = 'ferme'
    where role = 'candidat' and id = (select compte_id from public.participation where id = p_participation_id);
    if not found then
      raise exception 'Le compte de cette participation n''existe plus.';
    end if;
  end if;
end
$$;

-- Les transitions sont contrôlées par le déclencheur campagne_avant_maj.
create function public.changer_statut_campagne(p_campagne_id uuid, p_statut public.campagne_statut) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_organisateur() then
    raise exception 'Réservé à l''organisateur.' using errcode = '42501';
  end if;
  update public.campagne set statut = p_statut where id = p_campagne_id;
  if not found then
    raise exception 'Campagne introuvable.';
  end if;
end
$$;

-- Droits d'exécution : personne par défaut, puis seulement authenticated pour les neuf
-- fonctions appelables. Les fonctions de déclencheur et _inscrire n'ont aucun appelant client.
revoke all on function
  public.est_organisateur(),
  public.compte_avant_ecriture(),
  public.campagne_avant_maj(),
  public.depot_apres_insertion(),
  public.vote_boss_fige(),
  public.decider_compte(uuid, public.compte_etat),
  public._inscrire(uuid, uuid, boolean),
  public.sinscrire(uuid),
  public.ajouter_participant(uuid, uuid),
  public.se_desinscrire(uuid),
  public.verrouiller_vote(uuid),
  public.masquer_replique(uuid),
  public.enregistrer_decision(uuid, public.decision_type, text),
  public.changer_statut_campagne(uuid, public.campagne_statut)
from public, anon, authenticated;

grant execute on function
  public.est_organisateur(),
  public.decider_compte(uuid, public.compte_etat),
  public.sinscrire(uuid),
  public.ajouter_participant(uuid, uuid),
  public.se_desinscrire(uuid),
  public.verrouiller_vote(uuid),
  public.masquer_replique(uuid),
  public.enregistrer_decision(uuid, public.decision_type, text),
  public.changer_statut_campagne(uuid, public.campagne_statut)
to authenticated;
