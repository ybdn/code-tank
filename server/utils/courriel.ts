import { createTransport } from 'nodemailer'
import { creerJeton } from './jeton'

// Expéditeur de Code Tank (entreprise/identite.md).
const EXPEDITEUR = 'Code Tank <code-tank@ybdn.io>'

export async function envoyerLienVerification(
  config: { siteUrl: string; secretVerification: string; smtp: { host: string; port: number | string; user: string; pass: string } },
  compteId: string,
  email: string,
) {
  const { host, user, pass } = config.smtp
  const port = Number(config.smtp.port)
  const local = ['127.0.0.1', 'localhost'].includes(host)
  const lien = `${config.siteUrl}/api/compte/verifier?jeton=${creerJeton(compteId, email, config.secretVerification)}`
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
    text: `Bonjour,\n\nPour vérifier ton adresse e-mail et continuer ta candidature, ouvre ce lien. Il est valable 24 heures :\n\n${lien}\n\nSi tu n'as rien demandé, ignore ce message.\n\nCode Tank`,
  })
}
