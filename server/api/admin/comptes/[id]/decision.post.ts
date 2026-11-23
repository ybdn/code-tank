// Autoriser, refuser ou mettre en liste d'attente : decider_compte refuse les transitions interdites.
const ETATS = ['autorise', 'refuse', 'liste_attente'] as const

export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const id = uuidDe(event, 'id')
  const { etat } = await corpsObjet(event)
  if (!ETATS.includes(etat as (typeof ETATS)[number])) throw createError({ statusCode: 422, statusMessage: 'Décision inconnue.' })
  const { error } = await client.rpc('decider_compte', { p_compte_id: id, p_etat: etat as (typeof ETATS)[number] })
  if (error) throw erreurAdmin(error, 'Décision impossible.')
  return { ok: true }
})
