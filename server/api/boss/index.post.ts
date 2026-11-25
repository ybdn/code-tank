// Création d'une campagne en brouillon par creer_campagne, avec le JWT de l'appelant : la fonction exige un compte actif sans
// campagne active et contrôle chaque réglage.
export default defineEventHandler(async (event) => {
  const reglages = await reglagesDuCorps(event)
  const { client } = await utilisateurVerifie(event)
  const { data, error } = await client.rpc('creer_campagne', reglages)
  if (error) erreurCampagne(error, 'Création d\'une campagne :', 'La campagne ne peut pas être créée pour le moment. Réessaie dans un instant.')
  return { slug: data }
})
