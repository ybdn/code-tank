// Désinscription par se_desinscrire, avec le JWT de l'appelant : la fonction revérifie compte actif, statut ouverte et
// inscription (409 sinon). Le retrait du dépôt viendra avec l'epic 3.
export default defineEventHandler(async (event) => {
  const { client, id } = await campagneDeLInscrit(event)
  const { error } = await client.rpc('se_desinscrire', { p_campagne: id })
  if (error) erreurCampagne(error, 'Désinscription :', 'La désinscription a échoué. Réessaie dans un instant.')
  return { ok: true }
})
