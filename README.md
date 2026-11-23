# Code Tank, le site

Site public du concours de code Code Tank, jugé par Claude. Nuxt 4, TypeScript, rendu côté serveur, pnpm.

Ce lot contient le socle (accueil, charte, politique de confidentialité, mentions légales, en-têtes de sécurité),
le schéma de la base (`supabase/`, voir plus bas) et les comptes : connexion GitHub par Supabase Auth, création du
compte, vérification de l'e-mail de contact, page `/compte`, puis les campagnes : page publique, inscription et
désinscription, dépôt du zip, reçu, retrait, et l'administration `/admin` de l'organisateur. Le contrôle du
contenu du zip et le lancement des audits vivent hors de ce dépôt.

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

## Campagnes et dépôt

L'accueil liste les campagnes lisibles (la RLS cache les brouillons) ; `/campagnes/[slug]` est publique et
`/campagnes/[slug]/depot` demande un compte autorisé et inscrit. Les pages lisent la campagne par
`GET /api/campagnes[/slug]` (le client Supabase de la page ne sait pas lire la session pendant le rendu serveur) et le
reste, côté navigateur, avec la session du candidat (RLS et vues `ma_reception`, `mon_depot`, `places_campagne`).

- **Inscription** : `POST /api/campagnes/[slug]/inscription` (limite de débit, puis `sinscrire` avec la session du candidat ; la page
  passe par cette route). La fonction SQL reste appelable directement depuis un navigateur : c'est accepté, car elle ne permet qu'une
  inscription par compte et par campagne, et seulement à un compte autorisé à la main. **Désinscription** :
  `DELETE /api/campagnes/[slug]/inscription` appelle `se_desinscrire` avec sa session, puis efface la réception et les archives.
- **Dépôt en trois temps**, le zip ne passant jamais par le serveur Nuxt (corps de requête plafonné vers 4,5 Mo chez
  l'hébergeur, zip jusqu'à 20 Mo) :
  1. `POST /api/campagnes/[slug]/depot/url` vérifie la session, le compte `autorise`, la participation `inscrit`, le statut
     (`inscriptions` ou `depot`, comme `sinscrire`, car les deux phases se chevauchent), la clôture et la déclaration, puis
     délivre une URL d'envoi signée (clé de service, chemin `{campagne}/{participation}/{uuid}.zip` choisi par le serveur ;
     validité fixée à 2 h par Supabase, un seul envoi par chemin) ;
  2. le navigateur envoie le fichier au bucket privé `depots` (20 Mo, zip seulement, aucune politique de stockage) ;
  3. `POST /api/campagnes/[slug]/depot` revérifie tout, contrôle que l'archive est bien arrivée dans le dossier de la
     participation, écrit la ligne de `reception` (`en_attente`, une seule par participation) et efface l'ancienne archive
     ainsi que les envois jamais confirmés, sauf celle du dépôt déjà accepté.
- **Retrait** : `DELETE /api/campagnes/[slug]/depot` (fonction `retirer_depot` avec la session ; règle équivalente quand il
  n'existe qu'une réception), puis effacement de la réception et des archives. Un échec du stockage après la suppression
  en base est journalisé sans donnée personnelle et renvoyé en erreur 500.
- Rien dans ce lot ne fait passer une réception à `acceptee` ou `refusee` : le contrôle du zip, ailleurs, lira `reception`
  et écrira `depot` avec la clé de service. Les tests simulent ce contrôle.
- Limite connue : un envoi jamais confirmé reste dans le bucket jusqu'au prochain dépôt, retrait ou désinscription de ce
  candidat ; aucune tâche de nettoyage dans ce lot.

## Administration

`/admin` (comptes, réglages, campagnes, dépôts, vote du Boss, publication) est réservée à l'organisateur.

- **Accès** : le middleware `server/middleware/admin.ts` contrôle toute requête vers `/admin…` ou `/api/admin…` (casse,
  pourcentages et barres doublées compris, `cheminAdmin` dans `shared/utils/admin.ts`) : session vérifiée par Auth, puis
  `est_organisateur()` avec cette session. Sinon **404**, jamais 403 ni redirection. Pages et réponses d'administration
  portent `noindex` ; le lien « Administration » n'apparaît dans la navigation que pour l'organisateur (affichage
  seulement : la barrière est le serveur). Un candidat ou un visiteur qui arrive par la navigation du navigateur voit
  aussi la page 404, car les pages lisent leurs données par `/api/admin/*`, que le middleware refuse.
- **Écritures par la session de l'organisateur** (RLS et fonctions SQL : `decider_compte`, `changer_statut_campagne`,
  `ajouter_participant`, `verrouiller_vote`, `masquer_replique`, `enregistrer_decision`, tables `reglage`, `campagne`,
  `vote_boss`). La clé de service ne sert qu'à une chose : `GET /api/admin/participations/[id]/archive` délivre une URL de
  lecture signée de **60 secondes** après contrôle de l'organisateur. Les refus de la base (poids ≠ 100, transition
  interdite, vote verrouillé, publication sans vote verrouillé…) sont renvoyés tels quels (409).
- **Vote à l'aveugle** : tant qu'un vote n'est pas verrouillé, la base cache à la session de l'organisateur les audits et la
  case de réutilisation ; l'API ne les lit pas et l'écran le dit. Après verrouillage : audits, réplique (masquable), coût,
  case de réutilisation, décisions. Rien n'est exécuté : l'archive se télécharge, c'est tout (SPECS § 4).
- **Pages** : `/admin` (tableau de bord), `/admin/comptes`, `/admin/reglages`, `/admin/campagnes`,
  `/admin/campagnes/[slug]`. Dates saisies et affichées à l'heure de Paris.
- **E-mails de résultat** : quand `POST /api/admin/campagnes/[slug]/statut` fait passer une campagne à `publiee` avec succès,
  le serveur envoie un e-mail (texte seul, tutoiement, lien vers la page de la campagne, aucun score ni classement, expéditeur
  `code-tank@ybdn.io`) à chaque participant inscrit ayant un dépôt **et une adresse vérifiée**. Adresses lues avec la session de
  l'organisateur (RLS), jamais avec la clé de service. L'envoi ne bloque ni n'annule la publication : la réponse donne
  `{ envoyes, echecs, sansAdresseVerifiee }`, que la page affiche, et le journal ne cite aucune adresse. Un SMTP injoignable
  arrête la boucle (délai de 10 s par connexion). Il n'y a **pas de bouton de renvoi** (risque de doublons, aucune colonne pour
  se souvenir de qui a reçu quoi) ; la page le dit.
- **Pas dans ce lot** : aperçu du classement (la vue `classement` ne montre que les campagnes publiées), lancement des audits.

## Limite de débit

Table `debit` (migration `20261124000001_debit.sql`) : empreinte de l'IP, action, horodatage. RLS activée, aucun droit pour
`anon` ni `authenticated` ; seul le rôle de service y accède, par la fonction `consommer_debit`, qui compte, refuse ou enregistre
dans une seule transaction (verrou consultatif par empreinte et action : deux requêtes simultanées au dernier créneau n'en
laissent passer qu'une) et purge au passage les lignes de plus de 24 heures **de cette empreinte**. La purge générale des autres
empreintes est faite par le lot des tâches planifiées : tant qu'il n'existe pas, la promesse « 24 heures » de la politique de
confidentialité n'est tenue que pour les adresses qui reviennent.

- **L'IP n'est jamais stockée** : Nuxt (`server/utils/debit.ts`) la lit dans la première adresse de `x-forwarded-for` (posée par le
  proxy de l'hébergeur ; **ne vaut que derrière un proxy qui l'écrase**, sinon un client la choisit), en calcule un HMAC-SHA-256
  avec `NUXT_SECRET_DEBIT` (32 caractères au moins) et n'envoie que l'empreinte. Sans adresse lisible, tous les appels partagent
  une empreinte commune. Sans secret, ou si la base est injoignable : **503**, jamais un passage sans limite.
- **Plafonds** (constante `PLAFONDS`, un seul endroit), par IP : création de compte 5 / 24 h ; renvoi du lien de vérification
  5 / h ; demande d'URL de dépôt 30 / 24 h ; inscription à une campagne 20 / 24 h ; suppression de compte 5 / 24 h ;
  confirmation d'e-mail (`POST /api/compte/verifier`) 30 / h. Au-delà : **429** avec un message français et `Retry-After`.
  Le compte est fait juste avant l'action coûteuse, après les contrôles de session et de formulaire : une faute de frappe
  n'entame pas le plafond, mais une demande valable le fait même si elle échoue ensuite.
- **Non limités** : les autres routes (dont `PATCH /api/compte`, qui renvoie un lien si l'adresse change) et l'appel direct à
  `sinscrire`.
- **Tests** : les helpers de `tests/stack/aide.ts` envoient une adresse `x-forwarded-for` neuve à chaque requête ; aucun
  interrupteur ne désactive la limite.

## Conservation (tâches planifiées)

`GET /api/cron/conservation`, appelée une fois par jour par le planificateur de Vercel (`vercel.json`, entrée `crons` seule :
03:17 UTC). Elle exige `Authorization: Bearer <CRON_SECRET>` ; sans le bon secret, ou si `CRON_SECRET` manque ou fait moins de
32 caractères : **404**. Le secret est lu dans `process.env.CRON_SECRET` (le nom que Vercel envoie, sans préfixe `NUXT_`) et
comparé en temps constant. La route utilise la clé de service. Chaque tâche est idempotente, bornée (constantes `DELAIS` et
`BORNES` de `server/utils/conservation.ts`) et indépendante : l'échec de l'une met son code d'erreur dans la réponse sans arrêter
les suivantes. Réponse et journal : des compteurs et des codes, jamais de pseudo, d'adresse, de chemin ni d'identifiant.

| Tâche | Ce qu'elle fait | Borne |
|---|---|---|
| `debit` | supprime les lignes de plus de 24 h (`purger_debit`) | 10 000 |
| `envois` | efface les objets du bucket `depots` de plus de 24 h que ni `depot` ni `reception` ne référencent (`objets_abandonnes`) | 500 |
| `archives` | campagne `publiee` depuis 30 jours (`campagne.publiee_le`) : efface toutes les archives de ses participations, met `depot.chemin_stockage` à nul, supprime ses lignes `reception`, passe à `archivee`. Une campagne dont les archives dépassent la borne finit au passage suivant | 500 objets |
| `refuses` | supprime les comptes `refuse` depuis 30 jours | 50 |
| `attente` | compte en liste d'attente sans confirmation depuis 12 mois : e-mail de demande (`attente_demandee_le`) ; sans réponse sous 30 jours : suppression. Le candidat confirme par un bouton sur `/compte` (`confirmer_attente`) | 50 + 50 |
| `inactivite` | compte sans connexion depuis 24 mois et adresse vérifiée : e-mail d'avertissement (`prevenu_inactivite_le`) ; 30 jours plus tard, toujours sans connexion : suppression | 50 + 50 |

- **Suppression d'un compte** : une seule routine (`supprimerCompte`, `server/utils/compte.ts`), partagée avec `DELETE /api/compte` :
  archives du stockage, puis utilisateur Auth ; le déclencheur `participation_apres_depart` garde la ligne anonyme du classement.
  Elle refuse le compte de l'organisateur, que les requêtes des tâches excluent d'ailleurs déjà.
- **Délais que la spec ne fixe pas, à confirmer par le porteur** : 30 jours pour répondre à la demande de la liste d'attente
  (`attenteReponseJours`) et 30 jours entre l'e-mail d'inactivité et la suppression (`avertissementJours`).
- **Dernière connexion** : `/compte` appelle `noter_connexion` (au plus une écriture par jour) quand le candidat lit son compte ;
  elle annule l'avertissement d'inactivité.
- **E-mails** : texte seul, lien vers `/compte`, envoyés seulement à une adresse utilisable ; un échec d'envoi ne marque personne,
  et une panne du SMTP arrête la boucle. Un compte dont l'adresse n'est pas vérifiée n'est jamais averti, donc jamais supprimé pour inactivité.
- **Le planificateur ne règle rien chez Vercel** : définir `CRON_SECRET` dans le projet, puis déployer `vercel.json`.

## Droits du candidat

- **Suppression du compte** : `DELETE /api/compte` (session requise, corps `{ pseudo }` : le pseudo exact). L'organisateur ne
  peut pas supprimer son compte par là. Le serveur efface d'abord du bucket tout le dossier de chaque participation du compte
  (archives du dépôt, de la réception, envois jamais confirmés) ; si le stockage échoue, il répond 500 et ne touche à rien
  d'autre. Il supprime ensuite l'utilisateur Auth (clé de service) et la base fait le reste dans une seule transaction.
  Les clés étrangères suppriment `compte` (cascade depuis `auth.users`) et mettent `participation.compte_id` à nul ; le déclencheur
  `participation_apres_depart` (migration `20261124000003_suppression_compte.sql`) :
  - supprime la participation entière (donc dépôt, réception, audits, vote du Boss, décisions) quand elle n'a pas de dépôt ou que
    la campagne n'est ni `publiee` ni `archivee` ;
  - sinon la garde pour le classement, avec ses scores, et vide le reste : réception supprimée, décision `fermeture_compte`
    supprimée, commentaire du Boss effacé, dépôt vidé (chemin, empreinte, présentation, demande, fichiers exclus, outils d'IA,
    traces, faits, alertes, case de réutilisation), audits réduits à la clé et à la note de chaque critère (plus de
    justification, de preuve ni de réplique). Restent : notes, note d'outillage, note du Boss, décisions publiques
    (disqualification, départage) avec leur justification.
  Il s'applique aussi à toute suppression future d'un compte (inactivité de 24 mois).
- **Case de réutilisation** : `regler_contact_reutilisation(campagne, accord)` (session du candidat, appel direct depuis la page)
  met à jour la case de **sa** participation dans `depot` et dans `reception` quand elles existent, rien d'autre, même après la
  clôture. Interrupteur sur la page de dépôt dès qu'il existe une réception ou un dépôt.

### Pile locale et tests d'intégration

```sh
pnpm stack:start   # base, Auth, PostgREST, stockage, passerelle, boîte mail (http://127.0.0.1:54424, SMTP 54425)
pnpm test:stack    # construit le site, le lance contre la pile (stockage compris), GitHub simulé ; comptes, dépôt, administration, droits, conservation (les tests antidatent des objets par `docker exec` sur la base locale)
pnpm stack:stop
```

La pile est réduite pour tenir dans 3 Go (pas de studio, realtime, etc. ; le stockage est inclus, environ 170 Mo). Ports décalés : API 54421, base
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
| `CRON_SECRET` | Secret du planificateur (variable de Vercel, **sans préfixe `NUXT_`**), 32 caractères au moins ; sans lui, `/api/cron/conservation` répond 404 |
| `NUXT_SECRET_DEBIT` | Secret HMAC de l'empreinte des adresses IP (limite de débit), **32 caractères au moins** ; sans lui, les routes limitées répondent 503 |
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
