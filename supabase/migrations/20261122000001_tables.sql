-- Modèle de données de Code Tank (SPECS § 13).
-- Principe : refus par défaut. Les objets créés ensuite ne sont accordés ni à anon ni à
-- authenticated ; chaque droit est donné explicitement, avec sa politique (migration 3).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- L'ordre des valeurs de campagne_statut est l'ordre des transitions permises (§ 3).
create type public.compte_etat as enum
  ('email_a_verifier', 'verifie', 'autorise', 'liste_attente', 'refuse', 'ferme');
create type public.compte_role as enum ('candidat', 'organisateur');
create type public.campagne_statut as enum
  ('brouillon', 'inscriptions', 'depot', 'deliberation', 'prete', 'publiee', 'archivee');
create type public.participation_etat as enum ('inscrit', 'retire');
create type public.type_code as enum ('open_source', 'proprietaire');
create type public.audit_statut as enum ('en_cours', 'termine', 'echec');
create type public.decision_type as enum ('departage', 'disqualification', 'fermeture_compte');

-- Les lignes de compte sont créées par le serveur (clé de service) : github_id,
-- github_donnees et les dates d'état ne viennent jamais du client.
create table public.compte (
  id uuid primary key references auth.users (id) on delete cascade,
  github_id text not null unique,
  github_donnees jsonb,
  vrai_nom text not null check (char_length(vrai_nom) between 1 and 100),
  pseudo text not null check (
    pseudo = btrim(pseudo)
    and char_length(pseudo) between 2 and 30
    and lower(pseudo) <> 'candidat supprimé'
  ),
  email_contact text not null check (char_length(email_contact) between 3 and 254),
  email_verifie_le timestamptz,
  motivation text not null check (char_length(motivation) between 1 and 1000),
  depot_cite_url text not null check (depot_cite_url ~ '^https://' and char_length(depot_cite_url) <= 300),
  majeur_declare_le timestamptz not null,
  charte_acceptee_le timestamptz not null,
  version_charte date not null,
  derniere_connexion_le timestamptz not null default now(),
  prevenu_inactivite_le timestamptz,
  confirme_attente_le timestamptz,
  etat public.compte_etat not null default 'email_a_verifier',
  etat_le timestamptz not null default now(),
  role public.compte_role not null default 'candidat',
  cree_le timestamptz not null default now()
);
create unique index compte_pseudo_unique on public.compte (lower(pseudo));

-- Ligne unique, créée ici. plafond_comptes nul = pas de plafond tant que le porteur
-- n'en a pas décidé la valeur (SPECS § 15, « à confirmer »).
create table public.reglage (
  plafond_comptes integer check (plafond_comptes >= 0),
  plafond_depense_usd numeric(10, 2) not null default 50 check (plafond_depense_usd > 0)
);
create unique index reglage_ligne_unique on public.reglage ((true));
insert into public.reglage default values;

-- criteres : tableau de { cle, libelle, poids, jure, calcule? }. Le critère marqué
-- calcule prend sa note dans depot.note_outillage au lieu d'un audit.
create table public.campagne (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titre text not null,
  theme text not null,
  brief text not null,
  criteres jsonb not null check (jsonb_typeof(criteres) = 'array'),
  statut public.campagne_statut not null default 'brouillon',
  ouverture_inscriptions timestamptz not null,
  cloture_depot timestamptz not null,
  date_resultats timestamptz not null,
  max_participants integer not null check (max_participants > 0),
  regles_figees_le timestamptz,
  check (ouverture_inscriptions < cloture_depot and cloture_depot < date_resultats)
);

-- compte_id nul : compte supprimé, affiché « candidat supprimé » au classement.
create table public.participation (
  id uuid primary key default gen_random_uuid(),
  campagne_id uuid not null references public.campagne (id) on delete cascade,
  compte_id uuid references public.compte (id) on delete set null,
  etat public.participation_etat not null default 'inscrit',
  inscrit_le timestamptz not null default now(),
  retire_le timestamptz,
  unique (campagne_id, compte_id),
  check ((etat = 'retire') = (retire_le is not null))
);
create index participation_compte_id on public.participation (compte_id);

-- Un seul dépôt actif par participation ; chemin_stockage devient nul quand l'archive est effacée.
create table public.depot (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique references public.participation (id) on delete cascade,
  chemin_stockage text,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  taille_octets bigint not null check (taille_octets > 0),
  nb_fichiers integer not null check (nb_fichiers >= 0),
  fichiers_exclus jsonb not null default '[]',
  nb_tokens integer not null check (nb_tokens between 0 and 100000),
  presentation text not null check (char_length(presentation) between 1 and 500),
  demande text check (char_length(demande) <= 80),
  type_code public.type_code not null,
  licence_presente boolean not null,
  declaration_code_le timestamptz not null,
  outils_ia jsonb not null default '[]',
  traces_ia jsonb not null default '[]',
  contact_reutilisation boolean not null default false,
  alerte_manipulation boolean not null default false,
  alertes_integrite jsonb not null default '[]',
  depose_le timestamptz not null default now(),
  faits jsonb,
  note_outillage integer check (note_outillage between 0 and 10),
  check (type_code <> 'open_source' or licence_presente)
);

-- Une ligne par juré et par dépôt ; une relance incrémente tentatives.
create table public.audit (
  id uuid primary key default gen_random_uuid(),
  depot_id uuid not null references public.depot (id) on delete cascade,
  jure text not null,
  modele text not null,
  version_consignes text not null,
  batch_id text,
  statut public.audit_statut not null default 'en_cours',
  resultat jsonb,
  replique_masquee boolean not null default false,
  usage jsonb,
  cout_usd numeric(10, 4) check (cout_usd >= 0),
  tentatives integer not null default 1 check (tentatives >= 1),
  unique (depot_id, jure),
  check (statut <> 'termine' or resultat is not null)
);

create table public.vote_boss (
  participation_id uuid primary key references public.participation (id) on delete cascade,
  note integer not null check (note between 0 and 10),
  commentaire text,
  verrouille_le timestamptz
);

create table public.decision (
  id uuid primary key default gen_random_uuid(),
  campagne_id uuid not null references public.campagne (id) on delete cascade,
  participation_id uuid not null references public.participation (id) on delete cascade,
  type public.decision_type not null,
  justification text not null check (btrim(justification) <> ''),
  prise_le timestamptz not null default now(),
  unique (participation_id, type)
);
