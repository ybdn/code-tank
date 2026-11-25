import { createHmac } from 'node:crypto'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { SECRET_MIN } from './secret'

// Plafonds par adresse IP : au plus `max` appels par fenêtre de `secondes` (jamais plus de 24 h : durée de conservation).
// C'est le seul endroit où ils se règlent.
const JOUR = 86_400
export const PLAFONDS = {
  compte: { max: 5, secondes: JOUR }, // création de compte
} as const

// Première adresse de x-forwarded-for : le proxy de l'hébergeur la fixe, sans la reprendre d'un client. Sans adresse
// lisible, tous les appels partagent une empreinte commune plutôt que de passer sans limite.
const ipDe = (event: H3Event) => getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() || 'inconnue'

// L'adresse ne sort jamais de ce fichier en clair : seule son empreinte (HMAC-SHA-256 à clé secrète) est stockée.
const empreinte = (ip: string, secret: string) => createHmac('sha256', secret).update(ip).digest('hex')

// Refuse en 429 (avec Retry-After) au-delà du plafond. Une panne de la limite refuse aussi (503) : elle n'ouvre jamais les vannes.
export async function limiter(event: H3Event, action: keyof typeof PLAFONDS) {
  const { secretDebit } = useRuntimeConfig(event)
  if (secretDebit.length < SECRET_MIN) {
    console.error(`NUXT_SECRET_DEBIT manquante ou trop courte (${SECRET_MIN} caractères au moins).`)
    throw createError({ statusCode: 503, statusMessage: 'Le service est indisponible pour le moment. Réessaie plus tard.' })
  }
  const { max, secondes } = PLAFONDS[action]
  const { data, error } = await serverSupabaseServiceRole(event).rpc('consommer_debit', {
    p_empreinte: empreinte(ipDe(event), secretDebit),
    p_action: action,
    p_maximum: max,
    p_fenetre_s: secondes,
  })
  if (error || typeof data !== 'number') {
    console.error('Limite de débit :', error?.message)
    throw createError({ statusCode: 503, statusMessage: 'Le service est indisponible pour le moment. Réessaie plus tard.' })
  }
  if (data > 0) {
    setResponseHeader(event, 'retry-after', data)
    throw createError({ statusCode: 429, statusMessage: 'Trop de demandes depuis ton adresse. Réessaie plus tard.' })
  }
}
