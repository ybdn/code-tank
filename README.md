# Code Tank, le site

Site public de Code Tank, plateforme de défis de code entre amis : chaque inscrit crée sa campagne et en devient le Boss.
Nuxt 4, TypeScript, rendu côté serveur, pnpm.

Le site est en cours de réécriture sur un schéma neuf : il contient pour l'instant l'accueil, la charte, la politique de
confidentialité, les mentions légales, les en-têtes de sécurité, la création de compte par GitHub (`/compte`) et le socle de
la base (`supabase/`, voir plus bas). Les autres parcours (campagnes, dépôt, délibération) arrivent avec les epics suivants.

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

- `POST /api/compte` : crée le compte de la personne connectée par GitHub (pseudo, charte, majorité) par la RPC
  `creer_compte`, appelée avec la clé de service et l'id vérifié de la session ; limite par IP `compte` d'abord.
  Corps non JSON : **415**. Règle métier refusée : **409** `{ message }` en français.
  La version de la charte est `VERSION_CHARTE` (`shared/utils/compte.ts`), jamais reçue du client. Le compte naît
  `actif` en mode `ouvert`, `en_attente` en mode `liste_attente` ; en mode `ferme`, **409**.
- `POST /api/compte/pseudo` : change le pseudo d'un compte `en_attente` par la RPC `changer_pseudo`, appelée avec le JWT
  de la session (figé une fois le compte actif). Sans session : **401** ; corps non JSON : **415** ; refus : **409**.
- `server/middleware/admin.ts` : `/admin` et `/api/admin/**` répondent **404** à quiconque n'est pas admin (visiteur
  compris), d'après `est_admin()` appelée avec la session de l'utilisateur.
- `GET /api/admin/reglage` : mode d'accès courant (`{ mode }`). `POST /api/admin/reglage` : le règle par la RPC
  `regler_mode_acces`, avec le JWT de l'admin. Corps non JSON : **415** ; mode inconnu : **409**. Page : `/admin`
  (« Mode d'accès »), sans lien dans l'en-tête. Le rôle `admin` se pose à la main en SQL (voir `A-FAIRE.md`).
- `GET /api/boss` : état du compte connecté (`etat`) et ses campagnes, lus sous son JWT (RLS). `POST /api/boss` : crée une campagne en
  brouillon par la RPC `creer_campagne` (compte actif, une seule campagne active ; un brouillon échu passe d'abord en
  `expiree`), renvoie `{ slug }`.
  `GET`, `PATCH`, `DELETE /api/boss/[slug]` : la campagne (avec `compte_actif`, qui dit à la page si elle propose les actions, et `inscrits`, lu dans `campagne_phase`), son réglage (`modifier_campagne`, brouillon ou ouverte, règles
  non figées) et la suppression du brouillon (`supprimer_brouillon`), toutes avec le JWT de l'appelant. Tout autre compte
  que le Boss, visiteur compris : **404** ; corps non JSON (`POST`, `PATCH`, `DELETE`) : **415** ; règle métier : **409**.
  `POST /api/boss/[slug]/ouverture` : ouvre le brouillon par `ouvrir_campagne` (mêmes **404**, **415** et **409**).
  Correspondance des erreurs (`CT404` → 404, `P0001` → 409) : `server/utils/campagne.ts`. Pages : `/boss`, `/boss/[slug]`.
- `GET /api/campagnes` : campagnes publiques ouvertes de la vue `campagne_phase`, lues en anonyme (accueil). `GET
  /api/campagnes/[slug]` : une campagne de la vue, lue avec la session si elle existe (le Boss voit sa campagne sur
  invitation), sinon en anonyme, avec les critères et poids de `critere` ; hors de la vue (brouillon, invitation d'un
  autre, bloquée, expirée) ou slug hors forme : **404**. Avec une session, la page reçoit aussi `connecte`, `compte_actif`,
  `est_boss` et `inscrit` (lus sous RLS) ; les deux routes renvoient `places_restantes`. Pages : `/`, `/campagnes/[slug]`.
- `POST /api/campagnes/[slug]/inscription` (corps `{ connaissance: boolean }`, la case de prise de connaissance de l'envoi à
  Anthropic) et `DELETE /api/campagnes/[slug]/inscription` : inscription par `sinscrire` et désinscription par
  `se_desinscrire`, avec le JWT de l'appelant. Corps non JSON : **415** ; sans session : **401** ; slug hors forme ou
  campagne hors de `campagne_phase` : **404** ; règle métier (complet, hors phase, Boss juge, case non cochée…) : **409** ;
  limite de débit par compte (20 inscriptions par 24 h, tenue dans `sinscrire`, `CT429`) : **429**.
- `server/utils/json.ts` : `exigerJson`, **415** pour toute route d'écriture dont le corps n'est pas du JSON.
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
pnpm stack:start   # base, Auth, PostgREST, stockage, passerelle
pnpm test:stack    # construit le site et le lance contre la pile (tests/stack/)
pnpm stack:stop
```

La pile est réduite pour tenir dans 3 Go (pas de studio, realtime, boîte mail, etc.). Ports décalés : API 54421, base 54422.
Les tests de pile créent leurs utilisateurs par l'API d'administration d'Auth, ajoutent l'identité `github` en SQL dans
`auth.identities` et ouvrent la session par mot de passe (une vraie connexion GitHub est impossible en CI). `pnpm db:types` régénère `app/types/database.types.ts`
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
| `NUXT_SMTP_HOST`, `NUXT_SMTP_PORT`, `NUXT_SMTP_USER`, `NUXT_SMTP_PASS` | SMTP (Brevo) |
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
  de débit), `verrou` (bail global du jury), `critere` (critères et poids du jury, seule source), `reglage` (ligne unique,
  `mode_acces`), `compte` (né de GitHub, pseudo unique sans tenir compte de la casse, figé une fois le compte actif) et
  `participation` (une ligne par compte et par campagne, `inscrit` ou `retire`, prise de connaissance datée ; `compte_id`
  nul si le compte est supprimé) et `campagne` (statut = actes d'AD-2, bornes de dates et 10 places par contraintes, une campagne active par Boss par index
  unique partiel, `bloquee_le` et `motif_blocage` posés par la seule modération).
- `…_fonctions.sql` : `consommer_debit` (compte, refuse ou enregistre en une transaction, verrou consultatif par empreinte et
  action), `prendre_verrou` (atomique : de deux prises simultanées, une seule réussit) et `rendre_verrou` ;
  gardes `est_admin()` et `compte_actif()` ; `creer_compte` (identité GitHub lue dans `auth.identities`, charte, majorité,
  pseudo ; compte `actif` en mode `ouvert`, `en_attente` en mode `liste_attente`, refus en mode `ferme`) ;
  `regler_mode_acces` (garde `est_admin()`, trois modes) ; `changer_pseudo` (compte de l'appelant, `en_attente` seulement) ;
  gardes `est_boss(campagne)` et `campagne_vivante(campagne)` (non bloquée, échéance non passée) ; déclencheur
  `garder_transition` (graphe d'AD-2, quel que soit l'écrivain) ; `creer_campagne` (slug tiré du titre),
  `modifier_campagne`, `supprimer_brouillon` et `ouvrir_campagne` (brouillon dont la clôture des dépôts est à venir), qui
  prennent d'abord la ligne `for update`, puis la garde `campagne_vivante` ; vue `campagne_phase` (`security_invoker =
  false`) : ce que le public voit d'une campagne, phase déduite de `now()` et des dates (`a_venir`, `inscriptions` où
  inscription et dépôt sont ouverts ensemble, `depots_clos` ; hors `ouverte`, le statut), ni brouillon, ni expirée, ni
  bloquée, et publique ou dont l'appelant est le Boss, avec `places_restantes` calculées ; `sinscrire` (campagne publique
  en phase d'inscription, verrou de la ligne campagne, Boss juge refusé, case cochée, places, limite de débit par compte
  `consommer_debit` sous l'empreinte SHA-256 de l'id, 20 par 24 h) et `se_desinscrire` (statut `ouverte`) ;
  `modifier_campagne` refuse moins de places que d'inscrits, un Boss inscrit qui deviendrait juge et tout changement de
  visibilité dès le premier inscrit.
- `…_droits.sql` : RLS sur toutes les tables ; fonctions du socle réservées au rôle de service ; `compte` lisible par son
  propriétaire seul, `creer_compte` exécutable par `service_role` seul ; gardes, `regler_mode_acces` et `changer_pseudo`
  par `authenticated` seul (leurs règles vivent dans les fonctions) ; `reglage` lisible par l'admin seul (RLS sur
  `est_admin()`), sans droit du rôle de service ; `critere` en lecture seule pour tous,
  rôle de service compris,
  remplie des huit critères (100 points) ; `campagne` lisible par son Boss seul, sans droit du rôle de service ;
  `creer_campagne`, `modifier_campagne`, `supprimer_brouillon` et `ouvrir_campagne` exécutables par `authenticated` seul
  (leurs règles vivent dans les fonctions) ; `est_boss`, `campagne_vivante` et le contrôle `verifier_reglages` par aucun
  client ; `campagne_phase` lisible par `anon` et `authenticated`, sans droit du rôle de service ; `participation`
  lisible par son compte seul (RLS), sans écriture directe ni droit du rôle de service ; `sinscrire` et `se_desinscrire`
  exécutables par `authenticated` seul (leurs règles, limite de débit comprise, vivent dans les fonctions).

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
