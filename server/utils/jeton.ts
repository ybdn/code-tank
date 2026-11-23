import { createHmac, timingSafeEqual } from 'node:crypto'

// Jeton de vérification sans état : charge utile signée HMAC-SHA-256, rien n'est stocké.
const DUREE_S = 24 * 3600
export const SECRET_MIN = 32
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const signer = (donnees: string, secret: string) => createHmac('sha256', secret).update(donnees).digest()

export function creerJeton(compteId: string, email: string, secret: string, maintenantMs = Date.now()): string {
  const charge = b64(JSON.stringify({ c: compteId, e: email.toLowerCase(), x: Math.floor(maintenantMs / 1000) + DUREE_S }))
  return `${charge}.${b64(signer(charge, secret))}`
}

export type ResultatJeton = { ok: true; compteId: string; email: string } | { ok: false; raison: 'invalide' | 'expire' }

export function verifierJeton(jeton: string, secret: string, maintenantMs = Date.now()): ResultatJeton {
  const [charge, signature, ...reste] = jeton.split('.')
  if (secret.length < SECRET_MIN || !charge || !signature || reste.length) return { ok: false, raison: 'invalide' }
  const attendue = signer(charge, secret)
  const recue = Buffer.from(signature, 'base64url')
  // Comparaison en temps constant ; la longueur d'une signature SHA-256 n'est pas un secret.
  if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) return { ok: false, raison: 'invalide' }
  try {
    const { c, e, x } = JSON.parse(Buffer.from(charge, 'base64url').toString())
    if (typeof c !== 'string' || typeof e !== 'string' || typeof x !== 'number') return { ok: false, raison: 'invalide' }
    if (x * 1000 <= maintenantMs) return { ok: false, raison: 'expire' }
    return { ok: true, compteId: c, email: e }
  } catch {
    return { ok: false, raison: 'invalide' }
  }
}
