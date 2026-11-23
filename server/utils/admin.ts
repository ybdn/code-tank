import type { H3Event } from 'h3'
import { serverSupabaseClient } from '#supabase/server'
import type { utilisateurVerifie } from './session'

declare module 'h3' {
  interface H3EventContext {
    admin?: { client: Awaited<ReturnType<typeof utilisateurVerifie>>['client'] }
  }
}

// Non-organisateur, sans session ou session invalide : 404, jamais 403 ni redirection (l'administration ne se révèle pas).
const introuvable = () => createError({ statusCode: 404, statusMessage: 'Not Found' })

// Appelé par le middleware pour toute route d'administration : les écritures qui suivent passent par cette session,
// donc par la RLS et les fonctions SQL, jamais par la clé de service.
export async function verifierOrganisateur(event: H3Event) {
  let client
  try {
    client = await serverSupabaseClient(event)
    const { data, error } = await client.auth.getUser()
    if (error || !data.user) throw introuvable()
  } catch {
    throw introuvable()
  }
  const { data, error } = await client.rpc('est_organisateur')
  if (error) console.error('Contrôle de l\'organisateur :', error.message)
  if (data !== true) throw introuvable()
  return { client }
}

export function contexteAdmin(event: H3Event) {
  if (!event.context.admin) throw introuvable() // une route d'administration que le middleware n'a pas contrôlée
  return event.context.admin
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function uuidDe(event: H3Event, nom: string) {
  const v = getRouterParam(event, nom) ?? ''
  if (!UUID.test(v)) throw createError({ statusCode: 404, statusMessage: 'Introuvable.' })
  return v
}

export const estUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

// Lecture sous la session de l'organisateur : la RLS décide de ce qui revient.
export function lu<T>(r: { data: T | null; error: { message: string } | null }, quoi: string): T {
  if (r.error || r.data === null) {
    console.error(`Lecture ${quoi} :`, r.error?.message)
    throw createError({ statusCode: 500, statusMessage: 'Lecture impossible pour le moment.' })
  }
  return r.data
}

// Erreur d'une écriture : les refus voulus de la base (P0001) sont affichés tels quels, les autres traduits.
export function erreurAdmin(error: { code?: string; message: string }, secours: string) {
  if (error.code === '23505') return createError({ statusCode: 409, statusMessage: 'Cette valeur existe déjà.' })
  if (error.code === '23514') return createError({ statusCode: 422, statusMessage: 'La base refuse ces valeurs (dates, nombres ou longueurs).' })
  if (error.code === '42501') return createError({ statusCode: 409, statusMessage: 'La base refuse cette écriture à ce stade de la campagne.' })
  return erreurFonction(error, secours)
}

export const corpsObjet = async (event: H3Event): Promise<Record<string, unknown>> => {
  const corps = await readBody(event)
  return typeof corps === 'object' && corps && !Array.isArray(corps) ? corps : {}
}

export const invalide = (erreurs: Record<string, string>) =>
  createError({ statusCode: 422, statusMessage: 'Formulaire invalide.', data: { erreurs } })

// Campagne de l'URL, brouillon compris ; 404 si le slug n'existe pas.
export async function campagneDe(event: H3Event) {
  const { client } = contexteAdmin(event)
  const { data, error } = await client.from('campagne').select('*').eq('slug', getRouterParam(event, 'slug') ?? '').maybeSingle()
  if (error) {
    console.error('Lecture de la campagne :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'Lecture impossible pour le moment.' })
  }
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Campagne introuvable.' })
  return data
}
