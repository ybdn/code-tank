// Aperçu du classement, quel que soit le statut : même calcul que le classement public (fonction SQL apercu_classement),
// sous la session de l'organisateur. Vote à l'aveugle : la base rend le score Claude et les notes nuls tant que le vote du
// Boss de la ligne n'est pas verrouillé.
export default defineEventHandler(async (event): Promise<LigneApercu[]> => {
  const { client } = contexteAdmin(event)
  const campagne = await campagneDe(event)
  const { data, error } = await client.rpc('apercu_classement', { p_campagne_id: campagne.id })
  return lu({ data, error }, 'de l\'aperçu du classement') as unknown as LigneApercu[]
})
