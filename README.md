# Code Tank, le site

Site public du concours de code Code Tank, jugé par Claude. Nuxt 4, TypeScript, rendu côté serveur, pnpm.

Ce lot contient le socle (accueil, charte, politique de confidentialité, mentions légales, en-têtes de sécurité),
le schéma de la base (`supabase/`, voir plus bas) et les comptes : connexion GitHub par Supabase Auth, création du
compte, vérification de l'e-mail de contact, page `/compte`. Pas encore de dépôt de code ni d'administration.

## Commandes

```sh
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test         # construit le site et vérifie les pages et les en-têtes
pnpm build
```

## Comptes

Seule `/compte` (partie connectée) demande une session ; les pages publiques n'en ont pas besoin. La connexion
GitHub ne demande que l'identité et l'e-mail (aucun scope ajouté). Le compte (table `compte`) est créé par la route
serveur `POST /api/compte`, qui vérifie la session auprès d'Auth, exige `app_metadata.provider = 'github'`, lit
l'identité GitHub dans l'identité vérifiée (jamais dans le corps ni dans `user_metadata`) et écrit avec la clé de
service. Le profil se lit directement par la session de l'utilisateur (RLS) et se modifie par `PATCH /api/compte`
(session de l'utilisateur, RLS). La vérification de l'e-mail passe par un jeton signé HMAC-SHA-256, valable 24 h,
lié à l'adresse. Le lien de l'e-mail ouvre la page `/compte/verifier`, qui ne modifie rien : seul le clic sur « Confirmer
mon adresse » envoie `POST /api/compte/verifier` (aperçus de lien et antivirus ne valident donc rien). L'adresse lue en base
repasse par la règle du formulaire avant tout envoi et toute validation, car la colonne est écrivable directement.

### Pile locale et tests d'intégration

```sh
pnpm stack:start   # base, Auth, PostgREST, passerelle, boîte mail (http://127.0.0.1:54424, SMTP 54425)
pnpm test:stack    # construit le site, le lance contre la pile, GitHub simulé
pnpm stack:stop
```

La pile est réduite pour tenir dans 3 Go (pas de studio, realtime, storage, etc.). Ports décalés : API 54421, base
54422, boîte mail 54424 (web) et 54425 (SMTP, `smtp_port` dans `supabase/config.toml`).
`pnpm db:types` régénère `app/types/database.types.ts` depuis la base locale. Fournisseur GitHub en local : renseigner
`SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` et `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET` pour une vraie connexion ; les
tests créent leurs utilisateurs par l'API d'administration et n'en ont pas besoin.

### Variables d'environnement (noms seulement, aucune valeur dans le dépôt)

| Variable | Rôle |
|---|---|
| `NUXT_PUBLIC_SUPABASE_URL` | URL de Supabase. **Aussi nécessaire au build** : elle entre dans `connect-src` de la CSP. |
| `NUXT_PUBLIC_SUPABASE_KEY` | Clé publique (anon / publishable) |
| `NUXT_SUPABASE_SECRET_KEY` | Clé de service, serveur seulement |
| `NUXT_SECRET_VERIFICATION` | Secret HMAC des liens de vérification, **32 caractères au moins** ; sans lui (ou trop court), aucun e-mail ne part |
| `NUXT_VERSION_CHARTE` | Date de version de la charte (`AAAA-MM-JJ`), fixée par le porteur ; sans elle la création de compte répond 503 |
| `NUXT_SITE_URL` | URL publique absolue du site (`https://…`), pour les liens des e-mails ; sans elle, aucun e-mail ne part |
| `NUXT_SMTP_HOST`, `NUXT_SMTP_PORT`, `NUXT_SMTP_USER`, `NUXT_SMTP_PASS` | SMTP (Brevo ; en local, la boîte mail sur 54425, sans identifiant) |
| `NUXT_GITHUB_API` | Facultatif : base de l'API GitHub (`https://api.github.com` par défaut), changée par les tests |

## Base de données

Postgres local via la CLI Supabase (dépendance de développement), Docker requis. `db:start` ne démarre que la base ;
la pile réduite avec Auth et API est `stack:start` (voir plus haut). Rien n'est lié à un projet distant.

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
