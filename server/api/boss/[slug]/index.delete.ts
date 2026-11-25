// Suppression d'un brouillon par supprimer_brouillon ; toute autre étape refuse (409). JSON exigé comme toute écriture du site.
export default defineEventHandler(async (event) => {
  exigerJson(event)
  const { client, campagne } = await campagneDuBoss(event)
  const { error } = await client.rpc('supprimer_brouillon', { p_campagne: campagne.id })
  if (error) erreurCampagne(error, 'Suppression d\'un brouillon :', 'Le brouillon ne peut pas être supprimé pour le moment. Réessaie dans un instant.')
  return { ok: true }
})
