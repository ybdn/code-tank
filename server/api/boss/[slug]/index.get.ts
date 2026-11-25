// Campagne du Boss : 404 pour tout autre compte et pour le visiteur. `compte_actif` dit à la page si elle propose réglage
// et suppression (un Boss suspendu lit encore sa campagne, mais les RPC le refusent).
export default defineEventHandler(async (event) => {
  const { client, campagne } = await campagneDuBoss(event)
  const { data, error } = await client.rpc('compte_actif')
  if (error) erreurCampagne(error, 'Lecture de l\'état du compte :', 'La campagne ne peut pas être lue pour le moment.')
  return { ...campagne, compte_actif: data === true }
})
