# Registre des activités de traitement de Code Tank

Registre tenu au titre de l'article 30.1 du RGPD par le responsable du traitement. Il n'est pas affiché sur le site ; il doit pouvoir être présenté à la CNIL sur demande. Il ne contient aucune donnée personnelle de candidat.

- **Mise à jour** : 2026-11-24
- **Source** : ce registre reprend la politique de confidentialité (`content/politique-de-confidentialite.md`) et la charte (`content/charte.md`). En cas de modification d'un traitement, mettre à jour les trois documents ensemble.

## Responsable du traitement

| | |
|---|---|
| Responsable | Yoann BAUDRIN, personne physique, éditeur de Code Tank à titre personnel et non professionnel |
| Contact | support@ybdn.io |
| Représentant | Sans objet (responsable établi en France) |
| Délégué à la protection des données | Non désigné : non obligatoire (article 37 du RGPD : pas d'autorité publique, pas de suivi régulier et systématique à grande échelle, pas de données sensibles à grande échelle) |
| Site | code-tank.ybdn.io |

## Sous-traitants (commun à toutes les fiches)

| Sous-traitant | Rôle | Localisation | Garanties pour les transferts hors UE |
|---|---|---|---|
| Supabase Pte. Ltd. (Singapour) | Base de données, authentification, stockage privé des archives | Projet en région UE | Clauses contractuelles types (décision 2021/914, modules 2 et 3) prévues par son DPA |
| Vercel Inc. (États-Unis) | Hébergement du site, exécution du serveur, tâche planifiée de conservation | États-Unis principalement | Clauses contractuelles types (décision 2021/914) ; adhésion au cadre UE-États-Unis selon sa politique de confidentialité |
| Brevo SAS (France) | Envoi des e-mails (SMTP), expéditeur code-tank@ybdn.io | France (OVH) et Belgique (Google Cloud) | Clauses contractuelles types et cadre UE-États-Unis pour d'éventuels transferts de ses propres sous-traitants |
| GitHub B.V. / GitHub, Inc. | Fournisseur d'identité (connexion via Supabase Auth) ; contrôles des dépôts et lancement des audits (GitHub Actions, dépôt privé) | UE et États-Unis | Clauses contractuelles types (décision 2021/914) ; cadre UE-États-Unis |
| Anthropic Ireland, Limited | Analyse du code par l'API Claude | Non précisé | Clauses contractuelles types (modules 2 et 3) incorporées à son DPA |

Les DPA de chaque sous-traitant sont à accepter et à archiver (voir `A-FAIRE.md`).

---

## Fiche 1 — Comptes et autorisation des candidatures

| | |
|---|---|
| Finalités | Créer et gérer le compte d'un candidat ; vérifier son e-mail ; permettre à l'organisateur d'autoriser, refuser ou mettre en liste d'attente une candidature ; lutter contre les faux comptes ; réserver le concours aux majeurs ; envoyer les e-mails du service (vérification, décision, avertissements de conservation) |
| Bases légales | Exécution de la charte (article 6.1.b) ; intérêt légitime pour la lutte contre les faux comptes (article 6.1.f) |
| Personnes concernées | Candidats majeurs |
| Catégories de données | Identifiant GitHub et e-mail de connexion ; données du profil GitHub public (âge du compte, nombre de dépôts publics, activité récente) ; vrai nom ; e-mail de contact et état de sa vérification ; pseudo ; motivation (trois lignes) et lien du dépôt cité ; date de la déclaration « 18 ans ou plus » ; date de version de la charte acceptée ; date de dernière connexion ; état du compte et dates de la liste d'attente |
| Données sensibles | Aucune |
| Destinataires | L'organisateur (seul à lire vrai nom, e-mail, motivation et données GitHub) ; le candidat pour ses propres données ; sous-traitants : Supabase, Vercel, Brevo, GitHub. Public : le pseudo seulement |
| Durées de conservation | Durée de vie du compte. Compte sans connexion depuis 24 mois : prévenu par e-mail, supprimé 30 jours après sans connexion (sans avertissement si l'adresse n'est pas vérifiée). Candidature refusée : 30 jours après la décision. Liste d'attente : confirmation demandée tous les 12 mois, effacement sans réponse sous 30 jours. Adresse jamais vérifiée : 30 jours après la création du compte. Purges exécutées par la tâche planifiée `/api/cron/conservation` |

## Fiche 2 — Organisation des campagnes : inscription, dépôt, jugement, résultats

| | |
|---|---|
| Finalités | Inscrire un candidat à une campagne ; recevoir et contrôler son archive de code ; faire analyser le code par l'API Claude et par un juré humain ; vérifier la déclaration d'outils d'IA ; publier les résultats et le classement ; garder la preuve de ce qui a été jugé et déclaré |
| Bases légales | Exécution de la charte (article 6.1.b) ; intérêt légitime pour les contrôles contre le code malveillant et la vérification de la déclaration d'outils d'IA (article 6.1.f) |
| Personnes concernées | Candidats inscrits. Accessoirement, toute personne dont des données figureraient dans le code déposé, malgré l'interdiction posée par la charte (§ 3) |
| Catégories de données | Archive zip et code extrait ; empreinte SHA-256 de l'archive ; présentation (500 caractères), demande au jury (80 caractères), type de code ; déclaration faite au dépôt ; outils d'IA déclarés ; traces d'outils d'IA relevées dans le dépôt ; rapports, scores, notes par critère, entretiens et répliques des jurés ; pseudo |
| Données sensibles | Aucune collectée volontairement |
| Destinataires | L'organisateur et le juré humain ; le candidat pour son rapport ; sous-traitants : Supabase (stockage), GitHub (Actions, temporairement l'archive), Anthropic (présentation et code), Vercel. Public : pseudo et scores au classement |
| Durées de conservation | Archive zip et code extrait : effacés 30 jours après la publication des résultats. Rapports, entretiens, présentation, demande au jury, empreinte, déclarations, outils d'IA déclarés et traces relevées : tant que le compte existe. Scores et notes : restent sur la ligne du classement, anonymisée (« candidat supprimé ») à la suppression du compte. Chez Anthropic : 30 jours, jusqu'à 2 ans en cas de signalement par sa modération |

## Fiche 3 — Contact au sujet d'une réutilisation de code

| | |
|---|---|
| Finalités | Contacter un candidat si l'organisateur souhaite lui proposer la réutilisation de son code (accord écrit séparé, projet par projet) |
| Base légale | Consentement (article 6.1.a), par une case facultative au dépôt, modifiable à tout moment |
| Personnes concernées | Candidats ayant coché la case |
| Catégories de données | État de la case et date ; e-mail de contact (repris de la fiche 1) |
| Destinataires | L'organisateur ; sous-traitants : Supabase, Brevo |
| Durée de conservation | Tant que le compte existe ; le retrait du consentement s'applique immédiatement |

## Fiche 4 — Sécurité du service : limite de débit et journaux

| | |
|---|---|
| Finalités | Limiter la création de compte, l'inscription et le dépôt contre l'abus ; assurer le fonctionnement et la sécurité de l'hébergement |
| Base légale | Intérêt légitime : protéger le site contre l'abus (article 6.1.f) |
| Personnes concernées | Visiteurs et candidats |
| Catégories de données | Empreinte HMAC de l'adresse IP (jamais l'adresse en clair) ; données de navigation transmises à l'hébergeur pour afficher le site. Les journaux du serveur ne citent aucune adresse e-mail |
| Destinataires | L'organisateur ; sous-traitants : Supabase (empreintes), Vercel (journaux d'hébergement) |
| Durées de conservation | Empreintes d'adresse IP : 24 heures. Journaux de Vercel : selon la durée de rétention de l'offre Vercel utilisée |

## Fiche 5 — Exercice des droits des personnes

| | |
|---|---|
| Finalités | Recevoir et traiter les demandes d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité, et les retraits de consentement |
| Base légale | Obligation légale (article 6.1.c, articles 12 à 22 du RGPD) |
| Personnes concernées | Candidats et toute personne qui écrit à support@ybdn.io |
| Catégories de données | Identité et coordonnées du demandeur ; contenu de la demande et de la réponse ; justificatif d'identité seulement en cas de doute raisonnable, effacé après vérification |
| Destinataires | L'organisateur ; le fournisseur de la boîte support@ybdn.io |
| Durée de conservation | Demande et réponse : jusqu'à la fin de l'année civile suivant la réponse, pour pouvoir prouver qu'elle a été traitée dans le délai d'un mois |

---

## Mesures de sécurité (article 32)

- Connexion par GitHub avec les permissions minimales (identité et e-mail, aucun accès aux dépôts) ; e-mail vérifié par un lien signé HMAC-SHA-256 valable 24 heures, lié à l'adresse ; adresses jetables refusées.
- Un compte ne dépose rien tant que l'organisateur ne l'a pas autorisé ; droits vérifiés côté serveur et par la sécurité au niveau des lignes (RLS) de la base.
- Archives dans un bucket privé, accès par URL signées de courte durée ; chemins choisis par le serveur ; zip seulement, 20 Mo au plus.
- Le code déposé n'est jamais exécuté : contrôles automatiques et lecture par les jurés seulement.
- Clés d'API (Supabase, Claude, SMTP) et secrets HMAC côté serveur seulement, jamais dans le dépôt de code.
- Limite de débit sur les routes sensibles, avec empreinte HMAC de l'adresse IP.
- En-têtes de sécurité HTTP et politique de sécurité du contenu (CSP).
- Tâche planifiée quotidienne d'effacement aux durées prévues ; tâche protégée par un secret.
- Les violations de données sont consignées dans `docs/registre-des-violations.md`.

## À intégrer par la story 8.1 — lancement de la délibération par le Boss (story 4.3)

Ce registre est réécrit par la story 8.1 ; ces traitements y entrent (le compte Anthropic du Boss est un destinataire nommé).

| Traitement | Détail |
|---|---|
| Clé API Anthropic du Boss | Donnée confidentielle du Boss, rangée chiffrée dans Supabase Vault le temps de la délibération (ses 4 derniers caractères, visibles du Boss, dans `campagne.cle_fin`) ; jamais journalisée ni renvoyée. Test de la clé par un appel `count_tokens` à Anthropic sur un texte fixe. Effacement : story 4.6. |
| E-mail de fin de délibération au Boss (story 4.7) | Adresse e-mail du compte du Boss (Auth), lue avec le rôle de service au seul moment de l'envoi (`reserver_envoi`), jamais renvoyée au navigateur ni journalisée. Un e-mail texte « délibération terminée » (Brevo, `code-tank@ybdn.io`, aucun lien de pistage), une fois par campagne (`campagne.fin_prevenue_le`). Base légale : exécution de la charte (6.1.b). Durée : celle de la campagne pour la date d'envoi. |
| Engagements du Boss | Version du texte et date d'acceptation, une ligne par lancement (`engagement`), liée au compte et à la campagne. Base légale : exécution de la charte (6.1.b). Durée : celle de la campagne (suppression en cascade). |
| Journal des téléchargements (story 5.1) | Qui (compte du Boss juge), quoi (campagne, dépôt), quand, une ligne par lien d'archive filtrée demandé (`telechargement`), lue par personne depuis le site. Base légale : intérêt légitime (traçabilité de l'accès au code déposé, 6.1.f). Durée : 1 an après la fin de la campagne (SPECS § conservation) ; purge : epic 6 (conservation) ; d'ici là, suppression en cascade avec la campagne ; la ligne survit au retrait du dépôt ; la suppression du compte reste à traiter (story 8.1). |
