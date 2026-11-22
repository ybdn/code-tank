# Code Tank, le site

Site public du concours de code Code Tank, jugé par Claude. Nuxt 4, TypeScript, rendu côté serveur, pnpm.

Ce lot contient le socle : accueil, charte, politique de confidentialité, mentions légales, page `/compte` « bientôt »,
en-têtes de sécurité, et le schéma de la base (`supabase/`, voir plus bas). Pas encore d'authentification
ni de dépôt de code : le site ne se connecte pas encore à la base.

## Commandes

```sh
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test         # construit le site et vérifie les pages et les en-têtes
pnpm build
```

## Base de données

Postgres local via la CLI Supabase (dépendance de développement), Docker requis. Seule la base démarre,
pas la pile complète (ni Auth, ni Storage, ni API). Rien n'est lié à un projet distant.

```sh
pnpm db:start     # démarre Postgres (port 54422)
pnpm db:reset     # rejoue les migrations puis seed.sql
pnpm db:test      # tests pgTAP de supabase/tests/
pnpm db:stop
```

Avec Colima, exporter `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock` avant ces commandes.

- `supabase/migrations/` : tables (SPECS § 13), fonctions et déclencheurs, droits (RLS, privilèges, vues).
- `supabase/seed.sql` : données fictives pour le local et les tests. Ne jamais l'appliquer à préprod ni à prod :
  il crée un compte organisateur.
- Les tests simulent le rôle (`anon`, `authenticated`) et l'identité (`request.jwt.claims`), sans Auth ni API.
- Refus par défaut : `anon` et `authenticated` n'ont aucun droit sans privilège et politique explicites. Le serveur
  écrit avec la clé de service, qui contourne la RLS. Lire `classement`, `rapport` et `contact_reutilisation_lisible`
  par les vues, et lister les colonnes de `depot` (`select *` est refusé : `contact_reutilisation` n'est pas lisible directement).

Les textes légaux sont les fichiers de `content/`, rendus tels quels (Markdown). Ils ne contiennent que le texte publiable : la source complète, avec notes de rédaction, reste hors de ce dépôt. Les polices sont auto-hébergées
(Space Mono et Plus Jakarta Sans, licence OFL) : le site n'appelle aucun service tiers.

## Licence

[AGPL-3.0](LICENSE). Signaler une faille : voir [SECURITY.md](SECURITY.md).
