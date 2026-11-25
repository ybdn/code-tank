// Réglages d'une campagne par modifier_campagne : la fonction revérifie le Boss, la garde campagne_vivante, l'étape et les
// règles figées (409).
export default defineEventHandler(async (event) => {
  const reglages = await reglagesDuCorps(event)
  const { client, campagne } = await campagneDuBoss(event)
  const { error } = await client.rpc('modifier_campagne', { p_campagne: campagne.id, ...reglages })
  if (error) erreurCampagne(error, 'Modification d\'une campagne :', 'La campagne ne peut pas être enregistrée pour le moment. Réessaie dans un instant.')
  return { slug: campagne.slug }
})
