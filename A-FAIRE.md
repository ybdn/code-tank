# À faire de ton côté

Ce qui ne peut pas être fait depuis le code : des décisions, des comptes de prestataires, la republication du dépôt. À cocher au fur et à mesure. Ce fichier peut être supprimé une fois tout fait.

Ce qui est déjà rédigé dans le dépôt :

- `content/charte.md`, `content/politique-de-confidentialite.md`, `content/mentions-legales.md` : site perso, édité à titre non professionnel, sans SIREN, adresse ni téléphone ;
- `docs/registre-des-traitements.md` : registre RGPD (article 30) ;
- `docs/registre-des-violations.md` : registre et marche à suivre en cas de fuite de données (article 33).

## 1. Décisions à prendre (avant la republication)

- [ ] **Relecture par un avocat : oui ou non.** Pour un projet perso, gratuit et entre proches, elle n'est pas indispensable. Si tu y renonces, demande à Claude de retirer les bandeaux « PROJET, à faire relire par un avocat » des trois textes. Ne les laisse pas indéfiniment.
- [ ] **Conservation des demandes d'exercice des droits.** Le registre (fiche 5) propose de garder une demande et sa réponse jusqu'à la fin de l'année suivante. Valide ou change cette durée.

## 2. Si des comptes candidats existent déjà en production

La charte et la politique (§ 11) promettent : tout changement annoncé par e-mail à tous les comptes **30 jours avant** son entrée en vigueur, jamais appliqué à une campagne en cours.

- [ ] Vérifier si des comptes existent déjà (table `compte` dans Supabase).
- [ ] Si oui : envoyer cet e-mail et attendre 30 jours avant de mettre en ligne les nouveaux textes. Si non : rien à faire.

## 3. Prestataires (RGPD)

- [ ] **Vercel connaît ton identité.** C'est la contrepartie de l'anonymat dans les mentions légales : nom, adresse et téléphone à jour dans ton compte Vercel.
- [ ] **Accords de sous-traitance (DPA).** Pour chacun : vérifier qu'il s'applique à ton compte (souvent intégré aux conditions d'utilisation, parfois à signer depuis la console), puis en garder une copie PDF datée dans un dossier personnel.
  - [ ] Supabase
  - [ ] Vercel
  - [ ] Brevo
  - [ ] Anthropic (conditions commerciales de l'API, pas celles des abonnements grand public)
  - [ ] GitHub
- [ ] **Supabase** : vérifier que le projet est bien en région UE, comme l'écrit la politique.
- [ ] **Anthropic** : ne jamais envoyer de retour (« feedback ») sur un audit depuis la console, puisque la politique dit que tu n'en envoies aucun.
- [ ] **Facultatif, répertoire SIRENE** : ton SIREN existe toujours, et l'INSEE publie l'adresse associée sauf si tu as demandé la diffusion partielle. Ça se demande sur le site de l'INSEE si tu veux qu'elle n'apparaisse plus dans les annuaires d'entreprises.

## 4. Republier le dépôt sans historique

L'ancienne adresse et le SIREN sont dans l'historique git du dépôt public `ybdn/code-tank` (et dans ses 20 branches). Le dépôt n'a aucun fork.

**Ce que la suppression du dépôt GitHub ne touche pas** : le projet Vercel et ses variables d'environnement, le projet Supabase, l'application OAuth GitHub de la connexion, le compte Brevo. Rien à reconfigurer de ce côté, sauf la liaison Git de Vercel.

Étapes :

- [ ] Fusionner d'abord cette branche dans `develop`, pour repartir des textes corrigés.
- [ ] Vérifier que le dépôt privé du jury ne contient pas, lui aussi, l'adresse ou le SIREN.
- [ ] Noter les réglages GitHub du dépôt avant de le supprimer : protections de branches, Dependabot, installation de l'application Claude, éventuels webhooks. La CI (`.github/workflows/ci.yml`) n'utilise aucun secret GitHub.
- [ ] Dans un clone à jour, sur `develop` :

```bash
git checkout --orphan propre
```

```bash
git add -A && git commit -m "Code Tank"
```

- [ ] Supprimer le dépôt sur GitHub (Settings → Danger Zone), puis le recréer vide sous le même nom.
- [ ] Pousser la branche principale, puis recréer `preprod` et `prod` (Vercel ne déploie que ces deux-là, voir `vercel.json`) :

```bash
git remote set-url origin git@github.com:ybdn/code-tank.git
```

```bash
git push -u origin propre:develop
```

```bash
git push origin propre:preprod propre:prod
```

- [ ] Dans Vercel : reconnecter le projet au nouveau dépôt (Settings → Git), vérifier qu'un déploiement de `preprod` part.
- [ ] Remettre les réglages notés plus haut (branche par défaut `develop`, protections, Dependabot, application Claude).
- [ ] Limite à connaître : un clone, une archive (Software Heritage par exemple) ou un cache fait avant la suppression peut garder l'ancien historique. Pour un dépôt sans fork, le risque est faible.

## 5. Avant d'ouvrir les comptes

- [ ] **Supabase préprod et prod, Auth → Providers** : GitHub activé avec l'application OAuth existante (sans scope en plus),
  fournisseur e-mail désactivé (il ne sert qu'aux tests locaux).
- [ ] **URL de retour** : `https://preprod.code-tank.ybdn.io/compte` et `https://code-tank.ybdn.io/compte` dans les
  « Redirect URLs » d'Auth de chaque projet.
- [ ] **Vercel** : `NUXT_SECRET_DEBIT` (32 caractères au moins) défini en préprod et en prod ; sans lui, la création de
  compte répond 503.
- [ ] Vérifier que `CRON_SECRET` est défini dans Vercel et que la tâche `/api/cron/conservation` tourne (journal des crons de Vercel) : c'est elle qui applique les durées de conservation promises.
- [ ] **Rôle admin** (page `/admin`, mode d'accès) : en préprod puis en prod, une fois les migrations appliquées par
  l'Epic 8 et ton compte créé par GitHub, dans l'éditeur SQL de Supabase (remplacer `<ton-pseudo>`). Le site ne pose
  jamais ce rôle.

```sql
update public.compte set role = 'admin' where pseudo = '<ton-pseudo>' and etat = 'actif';
```

## 6. En continu

- [ ] Répondre à toute demande sur les données (support@ybdn.io) **sous un mois**.
- [ ] En cas de fuite de données : suivre `docs/registre-des-violations.md` (notification à la CNIL sous 72 heures si risque).
- [ ] À chaque nouveau prestataire ou nouvelle donnée collectée : mettre à jour ensemble la politique de confidentialité, la charte si besoin, et le registre des traitements.
