# Code Tank, le site

Site public de Code Tank, plateforme de défis de code entre amis : chaque inscrit crée sa campagne et en devient le Boss.
Nuxt 4, TypeScript, rendu côté serveur, pnpm.

Le site est en cours de réécriture sur un schéma neuf : il contient pour l'instant l'accueil, la charte, la politique de
confidentialité, les mentions légales, les en-têtes de sécurité, la création de compte par GitHub (`/compte`) et le socle de
la base (`supabase/`, voir plus bas), les campagnes, l'inscription et le dépôt. Le contrôle des dépôts et la délibération
arrivent avec les stories suivantes.

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
  `GET /api/boss/[slug]` renvoie aussi `jeton_invitation` (campagne sur invitation, sinon nul), seule réponse qui le porte ;
  `POST /api/boss/[slug]/invitation` : nouveau lien par `regenerer_invitation`, renvoie `{ jeton_invitation }` (mêmes **404**
  et **415** ; campagne publique, bloquée ou échue, compte non actif : **409**). L'ancien lien n'ouvre plus rien.
  Correspondance des erreurs (`CT404` → 404, `P0001` → 409) : `server/utils/campagne.ts`. Pages : `/boss`, `/boss/[slug]`.
- `GET /api/campagnes` : campagnes publiques ouvertes de la vue `campagne_phase`, lues en anonyme (accueil). `GET
  /api/campagnes/[slug]` : une campagne de la vue, lue avec la session si elle existe (le Boss voit sa campagne sur
  invitation), sinon en anonyme, avec les critères et poids de `critere` ; hors de la vue (brouillon, invitation d'un
  autre, bloquée, expirée) ou slug hors forme : **404**. Avec une session, la page reçoit aussi `connecte`, `compte_actif`,
  `est_boss` et `inscrit` (lus sous RLS) ; les deux routes renvoient `places_restantes`. Pages : `/`, `/campagnes/[slug]`.
  Un inscrit voit aussi la campagne sur invitation par cette adresse, sans le lien.
- `GET /api/invitation/[jeton]` : la campagne du lien d'invitation par `lire_invitation`, même forme que
  `/api/campagnes/[slug]`, jamais le jeton. Jeton hors forme (64 caractères hexadécimaux), inconnu ou régénéré, campagne
  bloquée, brouillon ou expirée : **404** ; sans session : **401** (la page `/invitation/[jeton]` propose la connexion).
  Pas de limite de débit : 256 bits ne se devinent pas.
- `POST /api/campagnes/[slug]/inscription` (corps `{ connaissance: boolean, jeton?: string }`, la case de prise de
  connaissance de l'envoi à Anthropic et, pour une campagne sur invitation, le jeton du lien, **404** hors forme) et `DELETE /api/campagnes/[slug]/inscription` : inscription par `sinscrire` et désinscription par
  `se_desinscrire`, avec le JWT de l'appelant. Corps non JSON : **415** ; sans session : **401** ; slug hors forme ou
  campagne hors de `campagne_phase` : **404** ; règle métier (complet, hors phase, Boss juge, case non cochée…) : **409** ;
  limite de débit par compte (20 inscriptions par 24 h, tenue dans `sinscrire`, `CT429`) : **429**. La désinscription
  est refusée (**409**) tant qu'il y a un dépôt ou une réception en attente.
- Dépôt (story 3.3), avec le JWT de l'appelant, corps JSON (**415** sinon), session (**401**), slug dans `campagne_phase`
  (**404**) : `POST /api/campagnes/[slug]/depot/url` vérifie par `peut_deposer` qu'il peut déposer (mêmes gardes que
  `deposer`, sauf la limite de dépôts, contrôlée par `deposer` ; **409**), passe la limite de 20 envois par compte et par 24 h (**429**), construit le chemin
  `<campagne_id>/<participation_id>/<uuid>.zip` et le signe avec la clé de service (`{ chemin, jeton }`) : le zip part
  directement au bucket privé `depots`. `POST /api/campagnes/[slug]/depot` (corps `{ chemin, presentation, demande, droit }`) :
  `deposer` crée la réception `en_attente`, puis `appelerJury` sans attendre ; règle métier : **409**, limite de 10 dépôts
  par compte et par 24 h : **429**. `DELETE /api/campagnes/[slug]/depot` : `retirer_depot`, puis effacement du bucket des
  chemins rendus (clé de service ; un échec est journalisé) ; sans dépôt : **404**. `GET /api/campagnes/[slug]` renvoie
  aussi `reception` et `depot` de l'inscrit (lus sous RLS). Page : `/campagnes/[slug]/depot` (motifs d'un refus en phrases ;
  pour un dépôt accepté : fichiers retenus et exclus, tokens estimés, empreinte SHA-256 ; jamais les alertes).
- `GET /api/boss/[slug]/estimation` (story 4.2) : pour le Boss de la campagne (**404** sinon), `{ disponible: false,
  raison }` tant que la campagne n'est pas ouverte, vivante, non bloquée, avec ses dépôts clos et sans réception en
  attente (lue avec la clé de service, que le Boss ne lit pas sous RLS) ; sinon `{ disponible: true, pire_cas_usd }` par
  `estimer_pire_cas` avec le JWT du Boss. Affiché dans le bloc « Délibération » de `/boss/[slug]`.
- `server/utils/json.ts` : `exigerJson`, **415** pour toute route d'écriture dont le corps n'est pas du JSON.
- `server/utils/debit.ts` : limite de débit par adresse IP (`limiter`, plafonds dans `PLAFONDS`). L'IP n'est jamais stockée :
  seule son empreinte HMAC-SHA-256 (`NUXT_SECRET_DEBIT`) part à `consommer_debit`. Sans secret ou base injoignable : **503** ;
  au-delà du plafond : **429** avec `Retry-After`.
- `server/utils/jury.ts` : `appelerJury`, réveil du jury (dépôt privé) par `POST <NUXT_JURY_URL>`, jamais bloquant.
- `server/utils/conservation.ts` : `verifierCron`, contrôle de `CRON_SECRET` en temps constant (**404** sinon).
  `GET /api/cron/conservation`, appelée chaque jour par le planificateur de Vercel (`vercel.json`) : aucune tâche de
  conservation encore (epic 6) ; elle réveille le jury (`appelerJury`, sans attendre ni échouer avec lui, filet d'AD-7).
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
  unique partiel, `bloquee_le` et `motif_blocage` posés par la seule modération) ; bucket privé `depots` (20 Mo, zip
  seulement, aucune politique de stockage), `reception` (une par participation, `en_attente` ou `refusee` avec ses motifs,
  `tentatives`) et `depot` (un seul actif par participation, colonnes du contrôle et des tokens, AD-6).
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
  bloquée, et publique, ou dont l'appelant est le Boss, ou à laquelle il est inscrit, avec `places_restantes` calculées,
  sans `boss_id` ni jeton (elle lit la vue interne `campagne_calculee`) ; `sinscrire` (campagne publique, ou sur
  invitation avec son jeton exact, pour son Boss ou un inscrit, en phase d'inscription, verrou de la ligne campagne, Boss juge refusé, case cochée, places, limite de débit par compte
  `consommer_debit` sous l'empreinte SHA-256 de l'id, 20 par 24 h) et `se_desinscrire` (statut `ouverte`, ni dépôt ni réception en attente ; efface une réception refusée) ;
  `lire_invitation` (campagne d'un jeton, colonnes de `campagne_phase`) et `regenerer_invitation` (Boss, `for update`,
  `campagne_vivante`, compte actif, campagne sur invitation) ; `jeton_invitation` (256 bits de pgcrypto en hexadécimal)
  posé par `creer_campagne` et `modifier_campagne` pour une campagne sur invitation, retiré au passage en publique ;
  `modifier_campagne` refuse moins de places que d'inscrits, un Boss inscrit qui deviendrait juge et tout changement de
  visibilité dès le premier inscrit ; `peut_deposer` (gardes du dépôt, réception en attente refusée, rend la participation), `deposer` (`for update` sur
  la campagne, phase de dépôt, Boss juge refusé, case, présentation rognée 1 à 500, demande 80 au plus, chemin de sa
  participation et objet présent dans le bucket, limite de débit par compte 10 par 24 h,
  premier dépôt qui pose `regles_figees_le`), `retirer_depot` (`for update`, statut `ouverte` avant la clôture, rend les
  chemins de `effacer_archives`) et `effacer_archives(depot)` (zip et archive filtrée, seul chemin d'effacement, AD-11) ;
  pour prive (story 3.4), `noter_tentative_reception` (compte un essai, rend le nombre), `refuser_reception` (motifs
  `[{ code, message }]`, rend le zip à effacer) et `accepter_depot` (campagne ouverte et vivante, archive filtrée présente
  à côté du zip ; crée ou remplace le dépôt avec les mesures de prive et la déclaration de la réception, supprime la
  réception, rend les archives de l'ancien dépôt), toutes trois `for update` sur la campagne ; `estimer_pire_cas`
  (story 4.2 : pire cas en dollars des audits à envoyer, tarifs du modèle du jury en constantes ; Boss de la campagne ou
  rôle de service, **42501** sinon). Table `audit` (story 4.2) : un audit par couple dépôt × juré, écrit par les
  fonctions des stories 4.3 et 4.4.
- `…_droits.sql` : RLS sur toutes les tables ; fonctions du socle réservées au rôle de service ; `compte` lisible par son
  propriétaire seul, `creer_compte` exécutable par `service_role` seul ; gardes, `regler_mode_acces` et `changer_pseudo`
  par `authenticated` seul (leurs règles vivent dans les fonctions) ; `reglage` lisible par l'admin seul (RLS sur
  `est_admin()`), sans droit du rôle de service ; `critere` en lecture seule pour tous,
  rôle de service compris,
  remplie des huit critères (100 points) ; `campagne` lisible par son Boss seul, le rôle de service n'en lit que quatre
  colonnes (prive) ;
  `creer_campagne`, `modifier_campagne`, `supprimer_brouillon` et `ouvrir_campagne` exécutables par `authenticated` seul
  (leurs règles vivent dans les fonctions) ; `est_boss`, `campagne_vivante` et le contrôle `verifier_reglages` par aucun
  client ; `campagne_phase` lisible par `anon` et `authenticated`, sans droit du rôle de service ; `campagne_calculee`
  lisible par aucun client ; `lire_invitation` et `regenerer_invitation` exécutables par `authenticated` seul (leurs règles
  vivent dans les fonctions) ; `participation`
  lisible par son compte seul (RLS), sans écriture directe, le rôle de service n'en lit que deux colonnes (prive) ;
  `sinscrire` et `se_desinscrire`
  exécutables par `authenticated` seul (leurs règles, limite de débit comprise, vivent dans les fonctions) ; `reception`
  et `depot` lisibles par le compte de leur participation seul (RLS, colonnes choisies : ni chemins, ni tentatives, ni
  faits, note d'outillage et alertes), sans écriture directe ; le rôle de service lit cinq colonnes de `reception`
  (prive) et rien de `depot` ; `peut_deposer`, `deposer` et `retirer_depot` exécutables par `authenticated` seul (leurs
  règles vivent dans les fonctions) ; `effacer_archives`, `noter_tentative_reception`, `refuser_reception` et
  `accepter_depot` par le rôle de service seul ; `audit` sans politique ni droit client, le rôle de service la lit
  seulement ; `estimer_pire_cas` exécutable par `authenticated` et le rôle de service (garde du Boss dans la fonction).

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
