# Code Tank, le site

Site public de Code Tank, plateforme de défis de code entre amis : chaque inscrit crée sa campagne et en devient le Boss.
Nuxt 4, TypeScript, rendu côté serveur, pnpm.

Le site est en cours de réécriture sur un schéma neuf : il contient pour l'instant l'accueil, la charte, la politique de
confidentialité, les mentions légales, les en-têtes de sécurité et le socle de la base (`supabase/`, voir plus bas). Les
parcours (comptes, campagnes, dépôt, délibération) arrivent avec les epics suivants.

## Commandes

```sh
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test         # construit le site et vérifie les pages et les en-têtes
pnpm build
```

## Utilitaires serveur

- `server/utils/debit.ts` : limite de débit par adresse IP (`limiter`, plafonds dans `PLAFONDS`). L'IP n'est jamais stockée :
  seule son empreinte HMAC-SHA-256 (`NUXT_SECRET_DEBIT`) part à `consommer_debit`. Sans secret ou base injoignable : **503** ;
  au-delà du plafond : **429** avec `Retry-After`.
- `server/utils/jury.ts` : `appelerJury`, réveil du jury (dépôt privé) par `POST <NUXT_JURY_URL>`, jamais bloquant.
- `server/utils/conservation.ts` : `verifierCron`, contrôle de `CRON_SECRET` en temps constant (**404** sinon).
  `GET /api/cron/conservation`, appelée chaque jour par le planificateur de Vercel (`vercel.json`), ne fait encore aucune tâche.
- `server/utils/courriel.ts` : `envoyerCourriel`, envoi d'un e-mail texte signé depuis `code-tank@ybdn.io`.
- `server/utils/secret.ts` : `SECRET_MIN`, longueur minimale des secrets (32 caractères).
- `server/utils/session.ts`, `server/utils/publique.ts` : session vérifiée par Auth, lecture anonyme de PostgREST à délai court.

### Pile locale et tests d'intégration

```sh
pnpm stack:start   # base, Auth, PostgREST, stockage, passerelle, boîte mail (http://127.0.0.1:54424, SMTP 54425)
pnpm test:stack    # construit le site et le lance contre la pile (tests/stack/)
pnpm stack:stop
```

La pile est réduite pour tenir dans 3 Go (pas de studio, realtime, etc.). Ports décalés : API 54421, base 54422, boîte mail
54424 (web) et 54425 (SMTP, `smtp_port` dans `supabase/config.toml`). `pnpm db:types` régénère `app/types/database.types.ts`
depuis la base locale.

### Variables d'environnement (noms seulement, aucune valeur dans le dépôt)

Supabase : l'intégration Supabase de la Marketplace Vercel fournit déjà les trois premières variables (noms `SUPABASE_*`),
le site les lit telles quelles. Les noms `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY` et `NUXT_SUPABASE_SECRET_KEY`
sont l'alternative locale (tests, pile locale) et **l'emportent** sur `SUPABASE_*` si les deux existent.

| Variable | Rôle |
|---|---|
| `SUPABASE_URL` (ou `NUXT_PUBLIC_SUPABASE_URL`) | URL de Supabase. **Aussi nécessaire au build** : elle entre dans `connect-src` de la CSP. |
| `SUPABASE_PUBLISHABLE_KEY` (repli `SUPABASE_ANON_KEY` ; ou `NUXT_PUBLIC_SUPABASE_KEY`) | Clé publique (`sb_publishable_…` ou anon) |
| `SUPABASE_SECRET_KEY` (repli `SUPABASE_SERVICE_ROLE_KEY` ; ou `NUXT_SUPABASE_SECRET_KEY`) | Clé de service, serveur seulement |
| `CRON_SECRET` | Secret du planificateur (variable de Vercel, **sans préfixe `NUXT_`**), 32 caractères au moins ; sans lui, `/api/cron/conservation` répond 404 |
| `NUXT_SECRET_DEBIT` | Secret HMAC de l'empreinte des adresses IP (limite de débit), **32 caractères au moins** ; sans lui, les routes limitées répondent 503 |
| `NUXT_SITE_URL` | URL publique absolue du site (`https://…`), pour les liens des e-mails ; sans elle, aucun e-mail ne part |
| `NUXT_SMTP_HOST`, `NUXT_SMTP_PORT`, `NUXT_SMTP_USER`, `NUXT_SMTP_PASS` | SMTP (Brevo ; en local, la boîte mail sur 54425, sans identifiant) |
| `NUXT_JURY_URL` | Facultatif : URL complète de `POST /api/jury` du projet Vercel du jury (dépôt privé). Sans elle ou sans le secret, le site n'appelle rien |
| `NUXT_JURY_SECRET` | Le secret de ce jury (`JURY_SECRET` de son projet), **32 caractères au moins** |

## Base de données

Postgres local via la CLI Supabase (dépendance de développement), Docker requis. `db:start` ne démarre que la base ;
la pile réduite avec Auth et API est `stack:start` (voir plus haut). Rien n'est lié à un projet distant.

```sh
pnpm db:start     # démarre Postgres (port 54422)
pnpm db:reset     # rejoue les migrations
pnpm db:test      # tests pgTAP de supabase/tests/
pnpm db:stop
```

Avec Colima, exporter `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock` avant ces commandes.

Trois migrations datées du même jour (AD-13) :

- `…_tables.sql` : `revoke all` par défaut pour `anon` et `authenticated` sur les tables, séquences et fonctions créées
  ensuite par `postgres`, et retrait de l'`EXECUTE` implicite de `PUBLIC` ; tables `debit` (limite
  de débit), `verrou` (bail global du jury) et `critere` (critères et poids du jury, seule source).
- `…_fonctions.sql` : `consommer_debit` (compte, refuse ou enregistre en une transaction, verrou consultatif par empreinte et
  action), `prendre_verrou` (atomique : de deux prises simultanées, une seule réussit) et `rendre_verrou`.
- `…_droits.sql` : RLS sur toutes les tables ; fonctions réservées au rôle de service ; `critere` en lecture seule pour tous,
  rôle de service compris,
  remplie des huit critères (100 points).

Refus par défaut : `anon` et `authenticated` n'écrivent jamais directement dans une table ; les écritures passent par des
fonctions SQL. Les tests pgTAP (`supabase/tests/`) vérifient ces droits par rôle et l'atomicité de `prendre_verrou` (deux
sessions réelles par `dblink`).

Les textes légaux sont les fichiers de `content/`, rendus tels quels (Markdown). Ils ne contiennent que le texte publiable :
la source complète, avec notes de rédaction, reste hors de ce dépôt. Les polices sont auto-hébergées (Space Mono et Plus
Jakarta Sans, licence OFL) : le site n'appelle aucun service tiers.

## Déploiement

Vercel ne construit que `preprod` (préprod, `preprod.code-tank.ybdn.io`) et `prod` (`code-tank.ybdn.io`) ; `develop` se lance en local (`git.deploymentEnabled` dans `vercel.json`).

## Licence

[AGPL-3.0](LICENSE). Signaler une faille : voir [SECURITY.md](SECURITY.md).
