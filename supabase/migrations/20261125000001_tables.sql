-- Schéma neuf de la plateforme (AD-13) : socle commun aux epics suivants. Les droits sont dans …_droits.sql.

-- Par défaut, rien pour les clients : les objets créés ensuite par ces migrations n'ouvrent aucun privilège à public, anon ni
-- authenticated. Chaque droit est accordé explicitement dans …_droits.sql.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;

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
