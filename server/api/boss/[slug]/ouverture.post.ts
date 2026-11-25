// Ouverture d'un brouillon par ouvrir_campagne : la fonction revérifie le Boss, la garde campagne_vivante, le compte actif,
// l'étape et la clôture des dépôts (409). JSON exigé comme toute écriture du site.
export default defineEventHandler(async (event) => {
  exigerJson(event)
  const { client, campagne } = await campagneDuBoss(event)
  const { error } = await client.rpc('ouvrir_campagne', { p_campagne: campagne.id })
  if (error) erreurCampagne(error, 'Ouverture d\'une campagne :', 'La campagne ne peut pas être ouverte pour le moment. Réessaie dans un instant.')
  return { slug: campagne.slug }
})
