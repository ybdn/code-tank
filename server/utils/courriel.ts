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

// E-mail « délibération terminée » au Boss (story 4.7, AD-12, SPECS § 11) : objet et texte. Le titre est un texte reçu : sans
// retour à la ligne (un en-tête Subject n'en porte pas). Lien direct vers l'espace du Boss, sans aucun paramètre de pistage.
export function courrielFin(siteUrl: string, slug: string, titre: string) {
  const t = titre.replace(/[\r\n\u0085\u2028\u2029]+/g, ' ').trim()
  return {
    sujet: `Code Tank — ${t} : la délibération est terminée`,
    texte: `Le jury a fini de délibérer sur ta campagne « ${t} ». Relis les répliques, puis publie les résultats :\n${siteUrl}/boss/${slug}`,
  }
}
