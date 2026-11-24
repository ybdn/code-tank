import { createTransport } from 'nodemailer'
import { adresseUtilisable } from './jetable'
import { creerJeton, SECRET_MIN } from './jeton'

// Expéditeur de Code Tank (entreprise/identite.md).
const EXPEDITEUR = 'Code Tank by ybdn.io <code-tank@ybdn.io>'

type Config = { siteUrl: string; secretVerification: string; smtp: { host: string; port: number | string; user: string; pass: string } }

// Délais courts : un SMTP injoignable ne doit pas retenir la requête de l'organisateur pendant des minutes.
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

const verifierSite = (config: Config) => {
  if (!/^https?:\/\/[^/]+/.test(config.siteUrl)) throw new Error('NUXT_SITE_URL manquante ou invalide (URL absolue attendue).')
  if (!config.smtp.host) throw new Error('NUXT_SMTP_HOST manquante.')
}

export async function envoyerLienVerification(config: Config, compteId: string, email: string) {
  // Échec explicite avant tout envoi : jamais un jeton signé d'une clé vide, ni un lien relatif.
  if (config.secretVerification.length < SECRET_MIN) {
    throw new Error(`NUXT_SECRET_VERIFICATION manquante ou trop courte (${SECRET_MIN} caractères au moins).`)
  }
  verifierSite(config)
  if (!adresseUtilisable(email)) throw new Error('Adresse de contact inutilisable : aucun e-mail envoyé.')
  const lien = `${config.siteUrl}/compte/verifier?jeton=${creerJeton(compteId, email, config.secretVerification)}`
  await transport(config.smtp).sendMail({
    from: EXPEDITEUR,
    to: email,
    subject: 'Code Tank : vérifie ton adresse e-mail',
    text: `Bonjour,\n\nPour vérifier ton adresse e-mail et continuer ta candidature, ouvre ce lien puis confirme. Il est valable 24 heures :\n\n${lien}\n\nSi tu n'as rien demandé, ignore ce message.\n\nCode Tank by ybdn.io`,
  })
}

// Panne du SMTP lui-même (et non refus d'un destinataire) : inutile d'insister auprès des suivants.
export const estPanneSmtp = (e: unknown) => ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'EAUTH'].includes((e as { code?: string }).code ?? '')

// Avis court à un candidat, avec un lien vers /compte. Lève si la configuration, l'adresse ou l'envoi sont en défaut :
// l'appelant ne marque alors personne comme prévenu.
export async function envoyerAvis(config: Config, to: string, sujet: string, texte: string) {
  verifierSite(config)
  if (!adresseUtilisable(to)) throw new Error('Adresse de contact inutilisable : aucun e-mail envoyé.')
  await transport(config.smtp).sendMail({ from: EXPEDITEUR, to, subject: sujet, text: `Bonjour,\n\n${texte}\n\n${config.siteUrl}/compte\n\nCode Tank by ybdn.io` })
}

// E-mail de résultat à chaque adresse donnée, un par un. Texte seul, aucun score ni classement.
// Ne lève jamais : il rend le compte des envois et des échecs. Rien d'un destinataire n'est journalisé (un message d'erreur
// SMTP peut citer l'adresse) ; un SMTP injoignable arrête la boucle, le reste compte en échec.
export async function envoyerResultats(config: Config, campagne: { slug: string; titre: string }, adresses: string[]) {
  let envoyes = 0
  try {
    verifierSite(config)
    const smtp = transport(config.smtp)
    const texte = `Bonjour,\n\nLes résultats de la campagne « ${campagne.titre} » viennent d'être publiés. Tu les retrouves sur la page de la campagne :\n\n${config.siteUrl}/campagnes/${campagne.slug}\n\nCode Tank by ybdn.io`
    for (const to of adresses) {
      try {
        await smtp.sendMail({ from: EXPEDITEUR, to, subject: `Code Tank : les résultats de « ${campagne.titre} » sont publiés`, text: texte })
        envoyes++
      } catch (e) {
        const code = (e as { code?: string }).code
        console.error('Envoi du résultat :', code ?? 'erreur')
        if (estPanneSmtp(e)) break
      }
    }
  } catch (e) {
    console.error('Envoi du résultat :', e instanceof Error ? e.message : e)
  }
  return { envoyes, echecs: adresses.length - envoyes }
}
