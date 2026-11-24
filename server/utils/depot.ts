import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

// Campagnes où l'on peut s'inscrire, déposer et retirer un dépôt (SPECS § 3 : les deux phases se chevauchent).
export const STATUTS_DEPOT = ['inscriptions', 'depot']

// Participation de l'utilisateur à la campagne de l'URL, lue avec sa session (la RLS décide).
export async function contexteParticipation(event: H3Event) {
  const { client, user } = await utilisateurVerifie(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const { data: campagne } = await client.from('campagne').select('id, statut, cloture_depot').eq('slug', slug).maybeSingle()
  if (!campagne) throw createError({ statusCode: 404, statusMessage: 'Campagne introuvable.' })
  const { data: participation } = await client
    .from('participation').select('id').eq('campagne_id', campagne.id).eq('compte_id', user.id).eq('etat', 'inscrit').maybeSingle()
  if (!participation) throw createError({ statusCode: 403, statusMessage: 'Tu n\'es pas inscrit à cette campagne.' })
  return { client, user, campagne, participation, service: serverSupabaseServiceRole(event) }
}

// Qui peut déposer : compte autorisé, inscrit, campagne en inscriptions ou dépôt, avant la clôture.
export async function contexteDepot(event: H3Event) {
  const c = await contexteParticipation(event)
  const { data: compte } = await c.client.from('compte').select('etat').eq('id', c.user.id).maybeSingle()
  if (compte?.etat !== 'autorise') throw createError({ statusCode: 403, statusMessage: 'Ton compte n\'est pas autorisé\u00a0: tu ne peux pas déposer.' })
  if (!STATUTS_DEPOT.includes(c.campagne.statut)) throw createError({ statusCode: 409, statusMessage: 'Le dépôt n\'est pas ouvert pour cette campagne.' })
  if (Date.now() >= Date.parse(c.campagne.cloture_depot)) throw createError({ statusCode: 409, statusMessage: 'La date limite de dépôt est passée.' })
  return c
}

export function declarationValide(corps: unknown) {
  const { declaration, erreurs } = validerDeclaration(typeof corps === 'object' && corps ? (corps as Record<string, unknown>) : {})
  if (Object.keys(erreurs).length) throw createError({ statusCode: 422, statusMessage: 'Formulaire invalide.', data: { erreurs } })
  return declaration
}

// Efface du bucket les archives données et tout ce que le dossier de la participation contient
// d'autre (envois jamais confirmés), sauf `garder`. L'erreur remonte : l'appelant sait que le stockage n'est pas net.
export async function effacerArchives(
  event: H3Event,
  campagneId: string,
  participationId: string,
  chemins: (string | null | undefined)[],
  garder: (string | null | undefined)[] = [],
) {
  const stockage = serverSupabaseServiceRole(event).storage.from('depots')
  const dossier = `${campagneId}/${participationId}`
  const { data: presents, error: erreurListe } = await stockage.list(dossier, { limit: 1000 })
  const cibles = new Set([...chemins, ...(presents ?? []).map((o) => `${dossier}/${o.name}`)])
  for (const g of garder) cibles.delete(g)
  cibles.delete(null)
  cibles.delete(undefined)
  const { error } = cibles.size ? await stockage.remove([...cibles] as string[]) : { error: null }
  const echec = erreurListe ?? error
  if (echec) {
    // Ni chemin ni identifiant dans le journal : ils désignent un candidat.
    console.error('Effacement du stockage :', echec.message)
    throw createError({ statusCode: 500, statusMessage: 'L\'archive n\'a pas pu être effacée du stockage. Écris à support@ybdn.io.' })
  }
}

// Erreur renvoyée par une fonction SQL : P0001 est un refus voulu, dont le message s'adresse au candidat.
export function erreurFonction(error: { code?: string; message: string }, secours: string) {
  if (error.code === 'P0001') return createError({ statusCode: 409, statusMessage: error.message })
  console.error(secours, error.message)
  return createError({ statusCode: 500, statusMessage: secours })
}

// Après un retrait ou une désinscription : la ligne de réception, puis les archives.
export async function solderReception(
  event: H3Event,
  campagneId: string,
  participationId: string,
  chemins: (string | null | undefined)[],
) {
  const { error } = await serverSupabaseServiceRole(event).from('reception').delete().eq('participation_id', participationId)
  if (error) {
    console.error('Suppression de la réception :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'La réception n\'a pas pu être supprimée. Écris à support@ybdn.io.' })
  }
  await effacerArchives(event, campagneId, participationId, chemins)
}
