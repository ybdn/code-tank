// Ajout à la main, au-delà du quota (deux places au plus) : ajouter_participant contrôle tout.
export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const { compte_id } = await corpsObjet(event)
  if (!estUuid(compte_id)) throw createError({ statusCode: 422, statusMessage: 'Choisis un candidat.' })
  const campagne = await campagneDe(event)
  const { error } = await client.rpc('ajouter_participant', { p_campagne_id: campagne.id, p_compte_id: compte_id })
  if (error) throw erreurAdmin(error, 'Ajout impossible.')
  return { ok: true }
})
