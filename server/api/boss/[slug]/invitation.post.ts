// Nouveau lien d'invitation par regenerer_invitation (story 2.4) : la fonction revérifie le Boss, la garde campagne_vivante, le
// compte actif et la visibilité (campagne publique : 409). L'ancien lien n'ouvre plus rien. JSON exigé comme toute écriture.
export default defineEventHandler(async (event) => {
  exigerJson(event)
  const { client, campagne } = await campagneDuBoss(event)
  const { data, error } = await client.rpc('regenerer_invitation', { p_campagne: campagne.id })
  if (error) erreurCampagne(error, 'Régénération d\'un lien d\'invitation :', 'Le lien ne peut pas être régénéré pour le moment. Réessaie dans un instant.')
  return { jeton_invitation: data }
})
