import type { H3Event } from 'h3'

// Lecture anonyme de PostgREST pour les pages publiques. Délai court et aucune relance : une base qui répond mal
// ne doit pas rendre l'accueil inaccessible (le client Supabase du module relance trois fois, avec attente).
export async function lirePublic<T>(event: H3Event, requete: string): Promise<T> {
  const { url, key } = useRuntimeConfig(event).public.supabase
  try {
    const r = await fetch(`${url}/rest/v1/${requete}`, { headers: { apikey: key }, signal: AbortSignal.timeout(3000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } catch (e) {
    console.error('Lecture publique :', e instanceof Error ? e.message : e)
    throw createError({ statusCode: 503, statusMessage: 'Les campagnes ne peuvent pas être lues pour le moment.' })
  }
}
