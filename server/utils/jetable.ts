import { isDisposableEmail } from 'disposable-email-domains-js'

// Liste maintenue dans le paquet (pas de service en ligne). Serveur seulement : la liste est lourde.
export const adresseJetable = (email: string) => isDisposableEmail(email)
