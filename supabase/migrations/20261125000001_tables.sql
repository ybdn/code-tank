-- Schéma neuf de la plateforme (AD-13) : socle commun aux epics suivants. Les droits sont dans …_droits.sql.

-- Par défaut, rien pour les clients : une table, une séquence ou une fonction créée ensuite par postgres n'ouvre aucun
-- privilège à anon ni authenticated, ni l'EXECUTE implicite de PUBLIC. Chaque droit est accordé dans …_droits.sql.
-- L'EXECUTE de PUBLIC est une entrée globale : seule une règle sans « in schema » peut le retirer.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Limite de débit (SPECS § 9 et § 10) : une ligne par action autorisée, rangée sous l'empreinte de l'adresse IP.
-- L'adresse n'arrive jamais ici : le serveur Nuxt envoie un HMAC-SHA-256 de l'IP avec un secret qu'il est seul à connaître.
create table public.debit (
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  action text not null check (char_length(action) between 1 and 40),
  le timestamptz not null default now()
);
create index debit_empreinte_action on public.debit (empreinte, action, le);

-- Bail d'exclusion global du jury (AD-7) : deux passages simultanés, même sur deux instances, créeraient deux lots d'audits,
-- donc des frais en double. Un nom, un détenteur, une expiration : un détenteur disparu libère le nom en expirant.
create table public.verrou (
  nom text primary key check (char_length(nom) between 1 and 40),
  detenteur text not null check (char_length(detenteur) between 1 and 80),
  expire_le timestamptz not null
);

-- Critères et poids du jury (AD-8) : seule source, la même pour toute campagne, remplie par …_droits.sql et en lecture seule.
-- `calcule` : note fournie par le scan de faits, jamais demandée au juré.
create table public.critere (
  cle text primary key check (cle ~ '^[a-z_]{1,40}$'),
  libelle text not null check (char_length(libelle) between 1 and 120),
  jure text not null check (jure in ('sudo', 'refacto', 'lint', 'pitch')),
  poids integer not null check (poids between 1 and 100),
  calcule boolean not null default false
);

-- Réglage du site (SPECS § 3) : une seule ligne, remplie par …_droits.sql. `mode_acces` fixe l'état d'un compte à sa création.
create table public.reglage (
  id boolean primary key default true check (id),
  mode_acces text not null default 'ouvert' check (mode_acces in ('ouvert', 'liste_attente', 'ferme'))
);

-- Compte Code Tank (AD-3) : né de la connexion GitHub, écrit seulement par creer_compte et les RPC d'administration.
-- L'e-mail reste dans auth.users (e-mail principal vérifié transmis par GitHub) ; la dernière connexion, dans
-- auth.users.last_sign_in_at. Le pseudo, seule donnée publique, a la forme d'un identifiant GitHub ; changer_pseudo le
-- change tant que le compte est en_attente, il est figé ensuite.
create table public.compte (
  id uuid primary key references auth.users on delete cascade,
  github_id text not null unique,
  pseudo text not null check (pseudo ~ '^[A-Za-z0-9_-]{3,39}$'),
  charte_acceptee_le timestamptz not null,
  version_charte text not null check (char_length(version_charte) between 1 and 40),
  majeur_declare_le timestamptz not null,
  role text not null default 'membre' check (role in ('membre', 'admin')),
  etat text not null check (etat in ('en_attente', 'actif', 'suspendu')),
  etat_le timestamptz not null default now(),
  cree_le timestamptz not null default now()
);
-- Unique sans tenir compte de la casse : « Ada » et « ada » sont le même pseudo.
create unique index compte_pseudo_unique on public.compte (lower(pseudo));

-- Campagne (SPECS § 3, AD-2) : créée, réglée et supprimée par les RPC du Boss seulement. Le statut ne stocke que les actes ;
-- le déclencheur garder_transition (…_fonctions.sql) tient le graphe. Critères, poids et modèle ne se règlent pas (AD-8) :
-- aucune colonne pour eux. Le Boss est boss_id (AD-3) ; bloquee_le et motif_blocage ne sont posés que par la modération
-- (AD-10, story 7.4).
create table public.campagne (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  boss_id uuid not null references public.compte,
  titre text not null check (char_length(titre) between 1 and 120),
  theme text not null check (char_length(theme) between 1 and 200),
  brief text not null check (char_length(brief) between 1 and 2000),
  langages text[] not null check (cardinality(langages) between 1 and 20 and array_position(langages, null) is null),
  visibilite text not null check (visibilite in ('publique', 'invitation')),
  role_boss text not null check (role_boss in ('juge', 'joueur')),
  max_participants integer not null check (max_participants between 1 and 10),
  ouverture_inscriptions timestamptz not null,
  cloture_depot timestamptz not null,
  date_resultats timestamptz not null,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'ouverte', 'deliberation', 'prete', 'publiee', 'archivee', 'expiree')),
  regles_figees_le timestamptz,
  bloquee_le timestamptz,
  motif_blocage text check (char_length(motif_blocage) between 1 and 500),
  cree_le timestamptz not null default now(),
  constraint campagne_dates_ordre check (ouverture_inscriptions < cloture_depot and cloture_depot < date_resultats),
  constraint campagne_duree_depot check (cloture_depot <= ouverture_inscriptions + interval '30 days'),
  constraint campagne_duree_resultats check (date_resultats <= cloture_depot + interval '15 days'),
  constraint campagne_blocage check ((bloquee_le is null) = (motif_blocage is null))
);
-- Une seule campagne active par Boss (AD-2), même entre deux créations simultanées.
create unique index campagne_active_unique on public.campagne (boss_id)
  where statut in ('brouillon', 'ouverte', 'deliberation', 'prete');
