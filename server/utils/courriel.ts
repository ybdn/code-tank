import { createTransport } from 'nodemailer'

// Expéditeur de Code Tank (entreprise/identite.md).
const EXPEDITEUR = 'Code Tank by ybdn.io <code-tank@ybdn.io>'

type Config = { siteUrl: string; smtp: { host: string; port: number | string; user: string; pass: string } }

// Délais courts : un SMTP injoignable ne doit pas retenir la requête pendant des minutes.
function transport({ host, port, user, pass }: Config['smtp']) {
  const p = Number(port)
  return createTransport({
    host,
    port: p,
    secure: p === 465,
    requireTLS: !['127.0.0.1', 'localhost'].includes(host),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    ...(user ? { auth: { user, pass } } : {}),
  })
}

// E-mail texte à un destinataire, signé. Lève si la configuration ou l'envoi sont en défaut ; l'appelant ne journalise
// jamais le message d'erreur SMTP, qui peut citer l'adresse.
export async function envoyerCourriel(config: Config, to: string, sujet: string, texte: string) {
  if (!/^https?:\/\/[^/]+/.test(config.siteUrl)) throw new Error('NUXT_SITE_URL manquante ou invalide (URL absolue attendue).')
  if (!config.smtp.host) throw new Error('NUXT_SMTP_HOST manquante.')
  await transport(config.smtp).sendMail({ from: EXPEDITEUR, to, subject: sujet, text: `Bonjour,\n\n${texte}\n\n${config.siteUrl}\n\nCode Tank by ybdn.io` })
}
