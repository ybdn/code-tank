// Désinscription : se_desinscrire (session de l'utilisateur) retire la participation et son dépôt ;
// le serveur efface ensuite la réception et les archives.
export default defineEventHandler(async (event) => {
  const { client, campagne, participation, service } = await contexteParticipation(event)
  const { data: depot } = await service.from('depot').select('chemin_stockage').eq('participation_id', participation.id).maybeSingle()
  const { data: reception } = await service.from('reception').select('chemin_stockage').eq('participation_id', participation.id).maybeSingle()

  const { error } = await client.rpc('se_desinscrire', { p_campagne_id: campagne.id })
  if (error) throw erreurFonction(error, 'Désinscription impossible.')
  await solderReception(event, campagne.id, participation.id, [depot?.chemin_stockage, reception?.chemin_stockage])
  return { ok: true }
})
