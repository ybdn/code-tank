import { createTransport } from 'nodemailer'
import { adresseUtilisable } from './jetable'
import { creerJeton, SECRET_MIN } from './jeton'

// Expéditeur de Code Tank (entreprise/identite.md).
const EXPEDITEUR = 'Code Tank <code-tank@ybdn.io>'

export async function envoyerLienVerification(
  config: { siteUrl: string; secretVerification: string; smtp: { host: string; port: number | string; user: string; pass: string } },
  compteId: string,
  email: string,
) {
  const { host, user, pass } = config.smtp
  // Échec explicite avant tout envoi : jamais un jeton signé d'une clé vide, ni un lien relatif.
  if (config.secretVerification.length < SECRET_MIN) {
    throw new Error(`NUXT_SECRET_VERIFICATION manquante ou trop courte (${SECRET_MIN} caractères au moins).`)
  }
  if (!/^https?:\/\/[^/]+/.test(config.siteUrl)) throw new Error('NUXT_SITE_URL manquante ou invalide (URL absolue attendue).')
  if (!host) throw new Error('NUXT_SMTP_HOST manquante.')
  if (!adresseUtilisable(email)) throw new Error('Adresse de contact inutilisable : aucun e-mail envoyé.')
  const port = Number(config.smtp.port)
  const local = ['127.0.0.1', 'localhost'].includes(host)
  const lien = `${config.siteUrl}/compte/verifier?jeton=${creerJeton(compteId, email, config.secretVerification)}`
  await createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: !local,
    ...(user ? { auth: { user, pass } } : {}),
  }).sendMail({
    from: EXPEDITEUR,
    to: email,
    subject: 'Code Tank : vérifie ton adresse e-mail',
    text: `Bonjour,\n\nPour vérifier ton adresse e-mail et continuer ta candidature, ouvre ce lien puis confirme. Il est valable 24 heures :\n\n${lien}\n\nSi tu n'as rien demandé, ignore ce message.\n\nCode Tank`,
  })
}
