# Politique de confidentialité de Code Tank

Code Tank est un concours de code ouvert aux développeurs majeurs, à l'adresse `code-tank.ybdn.io`. Cette page explique quelles données nous collectons, pourquoi, et ce que tu peux faire.

## 1. Qui est responsable du traitement

- **Responsable du traitement**&nbsp;: EI - YOANN BAUDRIN, entreprise individuelle (nom commercial&nbsp;: ybdn.io).
- **SIREN**&nbsp;: 994 347 979. **SIRET**&nbsp;: 994 347 979 00019.
- **Adresse**&nbsp;: 11 rue de la Sellerie, C612 - 95300 Pontoise - France.
- **Directeur de la publication**&nbsp;: Yoann BAUDRIN.
- **Contact pour tes données et tes droits**&nbsp;: `support@ybdn.io` (objet préfixé «&nbsp;Code Tank —&nbsp;»). L'adresse `code-tank@ybdn.io` est seulement l'expéditeur des e-mails du service.
- **Signaler une faille**&nbsp;: `support@ybdn.io`.
- **Délégué à la protection des données**&nbsp;: non désigné&nbsp;: la loi ne l'impose pas à cette activité. Les demandes vont à `support@ybdn.io`.

## 2. Les données que nous collectons

| Donnée | Finalité | Base légale | Durée |
|---|---|---|---|
| Identifiant GitHub et e-mail (connexion&nbsp;: aucun accès à tes dépôts) | Prouver que le profil est le tien. Un seul compte par identité GitHub. | Exécution de la charte du concours (le compte)&nbsp;; intérêt légitime (lutte contre les faux comptes) | Durée de vie du compte |
| Données GitHub lues sur ton profil public, en plus de la connexion&nbsp;: âge du compte, nombre de dépôts publics, activité récente | Aider l'organisateur à autoriser un compte | Intérêt légitime (lutte contre les faux comptes) | Durée de vie du compte. Candidature refusée ou en liste d'attente&nbsp;: voir § 6 |
| Vrai nom | T'identifier auprès de l'organisateur seul. Jamais public. | Exécution de la charte du concours | Durée de vie du compte. Candidature refusée ou en liste d'attente&nbsp;: voir § 6 |
| E-mail de contact et sa vérification | Vérifier le compte, t'envoyer la décision d'autorisation et les résultats | Exécution de la charte du concours | Durée de vie du compte. Candidature refusée ou en liste d'attente&nbsp;: voir § 6 |
| Motivation (trois lignes) et lien du dépôt cité | Aider l'organisateur à autoriser un compte | Exécution de la charte du concours&nbsp;; intérêt légitime (lutte contre les faux comptes) | Durée de vie du compte. Candidature refusée ou en liste d'attente&nbsp;: voir § 6 |
| Déclaration «&nbsp;18 ans ou plus&nbsp;» (date) | Réserver le concours aux majeurs | Exécution de la charte du concours | Durée de vie du compte |
| Pseudo | Affichage public (classement, résultats). C'est la seule donnée publique. | Exécution de la charte du concours | Tant que le compte existe&nbsp;; ensuite la ligne du classement passe sous «&nbsp;candidat supprimé&nbsp;» |
| Archive zip et code extrait | Analyse du code par Claude, contrôles du dépôt | Exécution de la charte du concours (dépôt et analyse)&nbsp;; intérêt légitime pour les contrôles contre le code malveillant | Effacés 30 jours après la publication des résultats (à l'archivage) |
| Déclaration de charte (date de version), déclaration de majorité et déclaration faite à chaque dépôt (type de code) | Preuve de ce que tu as déclaré | Exécution de la charte du concours | Tant que le compte existe |
| Rapports, scores, entretiens | Résultat du concours | Exécution de la charte du concours | Tant que le compte existe |
| Adresse IP du visiteur (limite de débit)&nbsp;: jamais conservée en clair, seulement une empreinte calculée avec une clé secrète, dans la base Supabase | Limiter la création de compte, l'inscription et le dépôt contre l'abus | Intérêt légitime (protéger le site contre l'abus) | 24 heures |

Données liées au dépôt&nbsp;:

| Donnée | Finalité | Base légale | Durée |
|---|---|---|---|
| Présentation (500 caractères), «&nbsp;la demande&nbsp;» (80 caractères, facultative), type de code | Présenter ton projet au jury&nbsp;; contrôler la licence | Exécution de la charte du concours | Tant que le compte existe |
| Outils d'IA déclarés au dépôt | Préparer une éventuelle réutilisation du code | Exécution de la charte du concours | Tant que le compte existe |
| Traces d'outils d'IA relevées dans le dépôt (dossiers et fichiers de configuration d'outils, mentions de co-auteur, en-têtes de fichiers générés) | Vérifier ta déclaration | Intérêt légitime (vérifier la déclaration d'outils d'IA) | Tant que le compte existe |
| Empreinte SHA-256 de l'archive | Preuve de ce qui a été jugé | Exécution de la charte du concours | Tant que le compte existe |
| Case facultative «&nbsp;D'accord pour être contacté au sujet d'une réutilisation&nbsp;» | Te contacter si l'organisateur veut réutiliser un code | Consentement (retirable à tout moment) | Tant que le compte existe. Tu peux modifier la case à tout moment. |

Ces données viennent de toi et de GitHub. La connexion GitHub nous donne ton identité et ton adresse e-mail, sans aucun accès à tes dépôts. Séparément, nous lisons sur ton profil public l'âge du compte, le nombre de dépôts publics et l'activité récente, pour aider l'organisateur à autoriser un compte.

Notre site n'utilise pas la déclaration de charte comme une signature&nbsp;: aucun document signé n'est demandé.

## 3. Ce que nous ne faisons pas

- Pas de mesure d'audience.
- Pas de pistage.
- Pas de publicité.
- Pas de revente de tes données.
- Pas d'accès à tes dépôts GitHub&nbsp;: la connexion GitHub demande l'identité et l'e-mail, rien de plus.
- Pas d'exécution de ton code&nbsp;: ton code est lu et analysé par des contrôles automatiques et par les jurés&nbsp;; il n'est jamais lancé.
- Pas d'entraînement de modèle sur ton code (voir Anthropic, § 4).

## 4. Qui reçoit tes données

| Destinataire | Rôle | Ce qu'il reçoit | Établissement et lieu de traitement |
|---|---|---|---|
| Vercel | Hébergement du site | Les données de navigation que le site transmet pour s'afficher | Vercel Inc., société du Delaware, États-Unis. Traitement&nbsp;: installations principales aux États-Unis, ailleurs dans le monde possible. |
| Supabase | Base de données, stockage privé des archives, authentification | Toutes les données du § 2 | Région UE. Entité contractante&nbsp;: Supabase Pte. Ltd., Singapour. Son accord de traitement des données (DPA) prévoit un traitement dans la région choisie par le client. |
| Brevo | Envoi des e-mails (SMTP), expéditeur `code-tank@ybdn.io` | Ton adresse e-mail et le contenu des messages (vérification, décision d'autorisation, résultats) | Brevo SAS, société par actions simplifiée immatriculée au RCS de Paris sous le n° 498 019 298, France&nbsp;; siège 9-17, rue Salneuve, 75017 Paris. L'entité responsable peut être Brevo France (SAS), Brevo Inc. (Amérique du Nord) ou Brevo Germany (GmbH) selon le lieu. Données hébergées chez OVH (France) et Google Cloud Platform (Belgique). |
| GitHub | 1. Connexion (via Supabase Auth). 2. Exécution des contrôles de dépôt et lancement des audits (GitHub Actions, dépôt privé, machines hébergées par GitHub) | 1. Ta demande de connexion&nbsp;; GitHub nous renvoie ton identité et ton e-mail&nbsp;; nous lisons ensuite les données de ton profil public. 2. Temporairement, l'archive que tu as déposée. | Entités GitHub citées&nbsp;: GitHub B.V. (Prins Bernhardplein 200, 1097JB Amsterdam, Pays-Bas) et GitHub, Inc. (88 Colin P. Kelly Jr. St., San Francisco, CA 94107, États-Unis). |
| Anthropic (API Claude) | Analyse du code par Claude | Ta présentation et ton code | Cocontractant pour un client de l'EEE&nbsp;: Anthropic Ireland, Limited. Lieu de traitement&nbsp;: non précisé. Sous-traitants d'Anthropic&nbsp;: [anthropic.com/subprocessors](https://www.anthropic.com/subprocessors) |

Détail pour Anthropic, relevé le 2026-11-20 dans les conditions de l'API (pas dans celles des abonnements grand public)&nbsp;:

- **Pas d'entraînement.** Anthropic ne se sert pas de ton code pour entraîner ses modèles (Commercial Terms, § B). Exception&nbsp;: les retours envoyés volontairement à Anthropic. Nous n'en envoyons aucun sur tes audits.
- **Conservation.** Anthropic efface les entrées et les sorties de son côté sous 30 jours. Exceptions&nbsp;: application de sa politique d'usage et obligation légale. Si son système de modération signale ton contenu comme contraire à sa politique d'usage, il peut le conserver jusqu'à 2 ans (les scores de classification, jusqu'à 7 ans).
- **Résultats de l'API Batches**&nbsp;: disponibles 29 jours après leur création.
- **Rôle RGPD.** Nous sommes responsable du traitement, Anthropic est notre sous-traitant (DPA).
- **Cocontractant**&nbsp;: Anthropic Ireland, Limited.

Nous te demandons de ne déposer aucun secret et aucun code confidentiel.

## 5. Transferts hors de l'Union européenne

- **Anthropic**&nbsp;: des transferts hors UE sont possibles. Le mécanisme retenu&nbsp;: les clauses contractuelles types de l'UE (modules 2 et 3), incorporées au DPA d'Anthropic. Le lieu de traitement n'est pas précisé.
- **Supabase**&nbsp;: région UE. Pour les transferts de l'entité elle-même, le DPA retient les clauses contractuelles types de la décision d'exécution (UE) 2021/914, modules 2 et 3. Sa politique de confidentialité cite les clauses contractuelles types pour les transferts vers les États-Unis et Singapour et ne mentionne pas le cadre de protection des données UE-États-Unis.
- **Vercel**&nbsp;: clauses contractuelles types de 2021 (décision 2021/914), modules 1, 2 ou 3. Sa politique de confidentialité écrit que Vercel respecte le cadre de protection des données UE-États-Unis&nbsp;; son DPA ne mentionne pas ce cadre.
- **Brevo**&nbsp;: ses conditions d'utilisation (DPA intégré) écrivent que Brevo assure un niveau de protection adéquat, «&nbsp;including Standard Contractual Clauses and supplementary measures&nbsp;», et peut s'appuyer sur le cadre UE-États-Unis. Sa politique de confidentialité cite des transferts possibles vers les États-Unis et l'Inde avec «&nbsp;appropriate safeguards&nbsp;» et indique que Brevo, Inc. adhère au cadre UE-États-Unis.
- **GitHub**&nbsp;: «&nbsp;the standard contractual clauses published by the European Commission&nbsp;» (décision 2021/914) et adhésion au cadre de protection des données UE-États-Unis.

## 6. Durées de conservation

| Donnée | Durée |
|---|---|
| Compte (identifiant GitHub, données GitHub lues, vrai nom, e-mail, motivation, déclaration d'âge) | Durée de vie du compte. Compte sans connexion depuis 24 mois&nbsp;: prévenu par e-mail, puis supprimé 30 jours après, sauf connexion de ta part. Si l'adresse n'est pas vérifiée, le compte est supprimé sans avertissement |
| Résultats (rapports, scores, entretiens) | Rapports et entretiens&nbsp;: gardés tant que le compte existe, supprimés avec lui. Scores et notes par critère&nbsp;: ils restent sur la ligne du classement, devenue anonyme («&nbsp;candidat supprimé&nbsp;») quand le compte est supprimé |
| Candidature refusée | Effacée 30 jours après la décision |
| Candidature en liste d'attente | Conservée tant que tu veux y rester. Nous te demandons une confirmation tous les 12 mois. Sans réponse sous 30 jours après la demande, elle est effacée. Sans adresse vérifiée ou utilisable, elle est effacée sans e-mail au moment où la confirmation serait demandée. |
| Candidature dont l'adresse n'a jamais été vérifiée | Effacée 30 jours après la création du compte |
| Archive zip et code extrait | Effacés 30 jours après la publication des résultats |
| Pseudo | Tant que le compte existe&nbsp;; ensuite la ligne du classement passe sous «&nbsp;candidat supprimé&nbsp;» |
| Déclaration de charte (date de version), déclaration de majorité et déclaration faite à chaque dépôt (type de code) | Tant que le compte existe |
| Présentation, demande au jury, empreinte SHA-256 de l'archive, case «&nbsp;d'accord pour être contacté au sujet d'une réutilisation&nbsp;» | Gardées avec les résultats, donc tant que le compte existe (supprimées avec lui) |
| Outils d'IA déclarés au dépôt et traces d'outils d'IA relevées | Gardés avec les résultats, donc tant que le compte existe (supprimés avec eux) |
| Chez Anthropic | 30 jours&nbsp;; jusqu'à 2 ans si le contenu est signalé (voir § 4) |
| Adresse IP du visiteur (limite de débit)&nbsp;: jamais conservée en clair, seulement une empreinte calculée avec une clé secrète, dans la base Supabase | 24 heures |

Tu peux supprimer ton compte à tout moment, par un bouton dans ton compte, avec confirmation, à effet immédiat. Si la campagne n'a pas encore été délibérée, ton dépôt est retiré. Après la publication des résultats, le classement garde la ligne sous «&nbsp;candidat supprimé&nbsp;». Tu peux retirer ton dépôt et te désinscrire d'une campagne tant que la délibération n'a pas commencé.

La fiche d'une campagne terminée (titre, thème, critères et poids, dates, classement) ne contient pas de donnée personnelle par elle-même&nbsp;: elle est gardée sans limite. Les données personnelles qui s'y rattachent (pseudo, rapport, présentation, demande au jury, empreinte, case de contact, déclarations de charte, de majorité et de dépôt, outils d'IA déclarés et traces relevées) suivent le compte&nbsp;: elles sont gardées tant que le compte existe, et la ligne du classement passe sous «&nbsp;candidat supprimé&nbsp;» quand le compte est supprimé, avec ses scores et ses notes, sans plus rien qui permette de t'identifier.

## 7. Tes droits

Tu as le droit&nbsp;:

- d'accéder à tes données&nbsp;;
- de les faire rectifier&nbsp;;
- de les faire effacer, ou de supprimer toi-même ton compte par le bouton prévu à cet effet (voir § 6)&nbsp;;
- d'en demander la limitation&nbsp;;
- de t'opposer à un traitement fondé sur l'intérêt légitime&nbsp;;
- de les récupérer dans un format réutilisable (portabilité)&nbsp;;
- de retirer ton consentement à tout moment, par exemple pour être contacté au sujet d'une réutilisation. Le retrait ne remet pas en cause ce qui s'est passé avant.

**Comment les exercer**&nbsp;: écris à `support@ybdn.io`. Nous répondons dans un délai d'un mois. Nous pouvons te demander de prouver ton identité.

**Réclamation**&nbsp;: tu peux saisir la CNIL. Nous préférons que tu nous écrives d'abord, sans que ce soit obligatoire.

## 8. Cookies

Nous n'utilisons que les cookies strictement nécessaires à ta connexion. Aucun traceur. Aucune mesure d'audience, aucune publicité.

Il n'y a pas de contrôle anti-robot tiers à l'ouverture.

## 9. Sécurité

- Connexion par GitHub avec les permissions minimales&nbsp;; aucun accès à tes dépôts. E-mail vérifié par lien, adresses jetables refusées.
- Un compte ne dépose rien tant que l'organisateur ne l'a pas autorisé. Les autorisations sont vérifiées côté serveur. Vrai nom, e-mail, motivation et données GitHub ne sont lisibles que par l'organisateur et par toi.
- Archives en stockage privé, accès par liens signés de courte durée. Ton code est lu et analysé par des contrôles automatiques et par les jurés&nbsp;; il n'est jamais lancé. La clé de l'API Claude reste côté serveur.
- Limite de débit sur la création de compte, l'inscription et le dépôt. Aucun script ne garantit à lui seul qu'un code est sain.

## 10. Mineurs

Code Tank est réservé aux majeurs. À la création du compte, tu déclares avoir 18 ans ou plus, et nous gardons la date de cette déclaration. Nous ne traitons pas sciemment de données de mineurs.

## 11. Modification de cette politique

Nous pouvons modifier cette politique, par exemple quand un service change ou avant une nouvelle campagne. Chaque texte porte une date de version&nbsp;; la version en vigueur est celle de cette page. La première version entre en vigueur à l'ouverture des comptes. Tout changement de la politique ou de la charte est annoncé par e-mail à tous les comptes 30 jours avant son entrée en vigueur, et ne s'applique jamais à une campagne en cours.
