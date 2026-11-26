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
  -- Lien secret d'une campagne sur invitation (story 2.4) : 256 bits aléatoires en hexadécimal, posés et retirés avec la
  -- visibilité par creer_campagne et modifier_campagne, remplacés par regenerer_invitation. Lu par le Boss seul (RLS).
  jeton_invitation text unique check (jeton_invitation ~ '^[0-9a-f]{64}$'),
  constraint campagne_dates_ordre check (ouverture_inscriptions < cloture_depot and cloture_depot < date_resultats),
  -- Jours comptés à l'heure de Paris, comme le formulaire, quel que soit le fuseau de la session (UTC sous PostgREST) :
  -- 30 jours qui traversent le passage à l'heure d'hiver ne deviennent pas 30 jours et 1 heure.
  constraint campagne_duree_depot
    check (cloture_depot at time zone 'Europe/Paris' <= (ouverture_inscriptions at time zone 'Europe/Paris') + interval '30 days'),
  constraint campagne_duree_resultats
    check (date_resultats at time zone 'Europe/Paris' <= (cloture_depot at time zone 'Europe/Paris') + interval '15 days'),
  constraint campagne_blocage check ((bloquee_le is null) = (motif_blocage is null)),
  constraint campagne_jeton check ((visibilite = 'invitation') = (jeton_invitation is not null))
);
-- Une seule campagne active par Boss (AD-2), même entre deux créations simultanées.
create unique index campagne_active_unique on public.campagne (boss_id)
  where statut in ('brouillon', 'ouverte', 'deliberation', 'prete');

-- Participation (SPECS § 13, story 2.3) : écrite par sinscrire et se_desinscrire seulement. Une réinscription après retrait
-- remet la même ligne à inscrit. compte_id devient nul à la suppression du compte (AD-11 tranchera le reste).
create table public.participation (
  id uuid primary key default gen_random_uuid(),
  campagne_id uuid not null references public.campagne on delete cascade,
  compte_id uuid references public.compte on delete set null,
  etat text not null default 'inscrit' check (etat in ('inscrit', 'retire')),
  connaissance_envoi_le timestamptz not null,
  inscrit_le timestamptz not null default now(),
  retire_le timestamptz,
  constraint participation_unique unique (campagne_id, compte_id),
  constraint participation_retrait check ((etat = 'retire') = (retire_le is not null))
);

-- Bucket des archives (story 3.3, AD-1) : privé, 20 Mo, zip seulement. Aucune politique sur storage.objects, donc refus par
-- défaut pour anon et authenticated : le site signe l'envoi et efface avec la clé de service. Chemins :
-- <campagne_id>/<participation_id>/<uuid>.zip, et <uuid>.filtre.zip pour l'archive filtrée (prive, story 3.4).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('depots', 'depots', false, 20971520, array['application/zip']);

-- Réception (story 3.3, SPECS § 4) : un zip envoyé, en attente du contrôle de prive (story 3.4), qui l'accepte (il devient le
-- depot) ou la refuse avec ses motifs ({ code, message }, pour le candidat). Une ligne au plus par participation : deposer
-- remplace une réception refusée et refuse tant qu'une autre attend. tentatives : essais de contrôle (story 3.4).
create table public.reception (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique references public.participation on delete cascade,
  chemin_stockage text not null check (chemin_stockage ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.zip$'),
  presentation text not null check (char_length(presentation) between 1 and 500),
  demande text check (char_length(demande) between 1 and 80),
  droit_declare_le timestamptz not null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'refusee')),
  motifs jsonb check (jsonb_typeof(motifs) = 'array'),
  tentatives integer not null default 0 check (tentatives >= 0),
  cree_le timestamptz not null default now()
);

-- Dépôt accepté (SPECS § 4 et § 13, AD-6, AD-11) : un seul actif par participation. Écrit par accepter_depot seule (rôle de
-- service, prive, story 3.4), retiré par retirer_depot. nb_tokens_estime : compte local au contrôle ; nb_tokens_exact :
-- count_tokens au lancement, qui pose trop_gros au-delà de 100 000. Alertes : lues du seul Boss juge (epic 5).
create table public.depot (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique references public.participation on delete cascade,
  chemin_stockage text not null check (chemin_stockage ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.zip$'),
  chemin_filtre text check (chemin_filtre ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.filtre\.zip$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  nb_fichiers integer not null check (nb_fichiers >= 0),
  fichiers_exclus jsonb not null default '[]' check (jsonb_typeof(fichiers_exclus) = 'array'),
  nb_tokens_estime integer not null check (nb_tokens_estime between 0 and 100000),
  nb_tokens_exact integer check (nb_tokens_exact >= 0),
  trop_gros boolean not null default false,
  faits jsonb,
  note_outillage integer check (note_outillage between 0 and 10),
  alerte_manipulation boolean not null default false,
  alertes_integrite jsonb not null default '[]' check (jsonb_typeof(alertes_integrite) = 'array'),
  presentation text not null check (char_length(presentation) between 1 and 500),
  demande text check (char_length(demande) between 1 and 80),
  droit_declare_le timestamptz not null,
  depose_le timestamptz not null default now()
);

-- Audit d'un juré sur un dépôt (story 4.2, AD-5, AD-6) : une ligne par couple dépôt × juré, créée au lancement (story 4.3) et
-- écrite par les fonctions de prive (story 4.4) ; aucune écriture directe. statut : a_envoyer, en_cours (lot envoyé, batch_id),
-- termine (resultat, usage, cout_usd) ou echec (renvoyé au relancement, compté par estimer_pire_cas). replique_masquee : la
-- réplique du juré n'est pas montrée (SPECS § 5). Lecture du Boss : stories 4.7 et epic 5.
-- shortcut: la liste des jurés de jure est recopiée de critere.jure ; elle change avec elle (AD-8), dans la même PR.
create table public.audit (
  id uuid primary key default gen_random_uuid(),
  depot_id uuid not null references public.depot on delete cascade,
  jure text not null check (jure in ('sudo', 'refacto', 'lint', 'pitch')),
  modele text check (char_length(modele) between 1 and 80),
  version_consignes text check (char_length(version_consignes) between 1 and 80),
  batch_id text check (char_length(batch_id) between 1 and 200),
  statut text not null default 'a_envoyer' check (statut in ('a_envoyer', 'en_cours', 'termine', 'echec')),
  resultat jsonb,
  replique_masquee boolean not null default false,
  usage jsonb,
  cout_usd numeric check (cout_usd >= 0),
  tentatives integer not null default 0 check (tentatives >= 0),
  cree_le timestamptz not null default now(),
  constraint audit_unique unique (depot_id, jure)
);
