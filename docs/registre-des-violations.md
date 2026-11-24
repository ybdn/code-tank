# Registre des violations de données de Code Tank

Registre tenu au titre de l'article 33.5 du RGPD : **toute** violation de données personnelles y est consignée, même si elle n'est pas notifiée à la CNIL. Il n'est pas affiché sur le site ; il doit pouvoir être présenté à la CNIL sur demande. N'y écrire aucune donnée personnelle d'un candidat (décrire, ne pas recopier), car ce fichier vit dans le dépôt de code.

## Qu'est-ce qu'une violation

Une destruction, une perte, une altération, une divulgation ou un accès non autorisé à des données personnelles, accidentel ou illicite. Exemples pour Code Tank :

- une clé de service Supabase, un secret HMAC ou un mot de passe SMTP publié ou volé ;
- une règle RLS ou une route qui laisse lire le vrai nom, l'e-mail, la motivation ou le rapport d'un autre candidat ;
- une archive de code rendue accessible à un tiers ;
- un e-mail envoyé au mauvais destinataire ;
- la perte de la base sans sauvegarde.

## Que faire en cas de violation

1. **Contenir** : révoquer ou changer le secret en cause, corriger la faille, couper l'accès. Noter l'heure à laquelle tu as eu connaissance de la violation : le délai de 72 heures part de là.
2. **Évaluer le risque** pour les personnes : quelles données, combien de personnes, quelles conséquences possibles (hameçonnage, divulgation du vrai nom, usurpation).
3. **Notifier la CNIL sous 72 heures**, sauf si la violation n'entraîne vraisemblablement aucun risque pour les personnes. Formulaire en ligne : notifications.cnil.fr. Une notification incomplète peut être complétée ensuite.
4. **Informer les personnes concernées sans tarder** si le risque est élevé (par exemple divulgation du vrai nom et de l'e-mail, ou des rapports), en langage clair : ce qui s'est passé, les conséquences probables, les mesures prises, le contact support@ybdn.io.
5. **Consigner** la violation ci-dessous, qu'elle ait été notifiée ou non, avec la raison de la décision.
6. Si la violation vient d'un sous-traitant (Supabase, Vercel, Brevo, GitHub, Anthropic), il doit te prévenir ; la notification à la CNIL reste à ta charge.

## Violations consignées

| N° | Date et heure de connaissance | Description (nature, données, nombre de personnes) | Conséquences probables | Mesures prises | Notifiée à la CNIL (date ou raison de ne pas notifier) | Personnes informées (date ou raison) |
|---|---|---|---|---|---|---|
| — | — | Aucune violation à ce jour | — | — | — | — |
