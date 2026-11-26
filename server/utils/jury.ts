import type { H3Event } from 'h3'
import { SECRET_MIN } from './secret'

// Appel du jury (dépôt privé, fonction POST /api/jury). Jamais bloquant : un échec est journalisé (code seulement) et
// l'action de l'utilisateur réussit quand même. Le jury fait ce qu'il a à faire (réceptions, délibération) et répond tout de
// suite : 202 (passage lancé), 409 (déjà en cours). Sans NUXT_JURY_URL et NUXT_JURY_SECRET, rien n'est appelé.
export const DELAI_JURY_MS = 5000

export type EtatJury = 'lance' | 'deja_en_cours' | 'non_configure' | 'echec'
export type ResultatJury = { etat: EtatJury; code: number }

let avertiNonConfigure = false

// `origine` : pourquoi l'appel (journal). `code` : le code HTTP reçu, 0 sans réponse.
export async function appelerJury(event: H3Event, origine: 'reception' | 'cron' | 'bouton' | 'lancement'): Promise<ResultatJury> {
  const { juryUrl, jurySecret } = useRuntimeConfig(event)
  if (!juryUrl || jurySecret.length < SECRET_MIN) {
    if (!avertiNonConfigure) {
      avertiNonConfigure = true
      console.warn(`Jury non configuré (NUXT_JURY_URL, et NUXT_JURY_SECRET de ${SECRET_MIN} caractères au moins) : aucun appel.`)
    }
    return { etat: 'non_configure', code: 0 }
  }
  let code = 0
  try {
    const r = await fetch(juryUrl, { method: 'POST', headers: { authorization: `Bearer ${jurySecret}` }, signal: AbortSignal.timeout(DELAI_JURY_MS) })
    code = r.status
    await r.body?.cancel()
  } catch {
    // injoignable ou trop lent : code 0
  }
  const etat: EtatJury = code === 202 || code === 200 ? 'lance' : code === 409 ? 'deja_en_cours' : 'echec'
  if (etat === 'echec') console.error(`Appel du jury (${origine}) : échec, code ${code}.`)
  return { etat, code }
}
