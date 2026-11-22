# Code Tank, le site

Site public du concours de code Code Tank, jugé par Claude. Nuxt 4, TypeScript, rendu côté serveur, pnpm.

Ce lot contient le socle : accueil, charte, politique de confidentialité, mentions légales, page `/compte` « bientôt »,
en-têtes de sécurité. Pas encore d'authentification, de base de données ni de dépôt de code.

## Commandes

```sh
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test         # construit le site et vérifie les pages et les en-têtes
pnpm build
```

Les textes légaux sont les fichiers de `content/`, rendus tels quels (Markdown). Les polices sont auto-hébergées
(Space Mono et Plus Jakarta Sans, licence OFL) : le site n'appelle aucun service tiers.

## Licence

[AGPL-3.0](LICENSE). Signaler une faille : voir [SECURITY.md](SECURITY.md).
