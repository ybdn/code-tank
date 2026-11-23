// Retire le dépôt : la fonction SQL, avec la session de l'utilisateur, décide si c'est permis ; le serveur
// efface ensuite la réception et les archives. Il peut n'exister qu'une réception, sans dépôt accepté.
export default defineEventHandler(async (event) => {
  const { client, campagne, participation, service } = await contexteParticipation(event)
  // Les chemins se lisent avant la fonction : elle supprime la ligne du dépôt.
  const { data: depot } = await service.from('depot').select('chemin_stockage').eq('participation_id', participation.id).maybeSingle()
  const { data: reception } = await service.from('reception').select('chemin_stockage').eq('participation_id', participation.id).maybeSingle()
  if (!depot && !reception) throw createError({ statusCode: 404, statusMessage: 'Tu n\'as pas de dépôt dans cette campagne.' })

  if (depot) {
    const { error } = await client.rpc('retirer_depot', { p_campagne_id: campagne.id })
    if (error) throw erreurFonction(error, 'Retrait impossible.')
  } else if (!STATUTS_DEPOT.includes(campagne.statut)) {
    // Même règle que retirer_depot : plus de retrait une fois la délibération commencée.
    throw createError({ statusCode: 409, statusMessage: 'Retrait impossible : la délibération a commencé.' })
  }
  await solderReception(event, campagne.id, participation.id, [depot?.chemin_stockage, reception?.chemin_stockage])
  return { ok: true }
})
