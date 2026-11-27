// Désinscription par se_desinscrire, avec le JWT de l'appelant : la fonction revérifie compte actif, statut ouverte et
// inscription, sans dépôt ni réception en attente (409 sinon : retirer_depot d'abord).
export default defineEventHandler(async (event) => {
  const { client, id } = await campagneDeLInscrit(event)
  const { error } = await client.rpc('se_desinscrire', { p_campagne: id })
  if (error) erreurCampagne(error, 'Désinscription :', 'La désinscription a échoué. Réessaie dans un instant.')
  return { ok: true }
})
