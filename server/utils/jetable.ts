import { isDisposableEmail } from 'disposable-email-domains-js'
import { validerProfil } from '../../shared/utils/compte'

// Liste maintenue dans le paquet (pas de service en ligne). Serveur seulement : la liste est lourde.
export const adresseJetable = (email: string) => isDisposableEmail(email)

// Règle commune à tout envoi et à toute validation, appliquée à l'adresse lue en base : le candidat peut
// écrire cette colonne directement par l'API, la base n'en contrôle que la longueur.
export const adresseUtilisable = (email: string) =>
  email === email.trim().toLowerCase() && !validerProfil({ email_contact: email }).email_contact && !adresseJetable(email)
