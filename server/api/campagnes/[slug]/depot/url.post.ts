// Délivre une URL d'envoi signée : le zip va directement au stockage, il ne passe pas par ce serveur
// (l'hébergeur plafonne le corps d'une requête à environ 4,5 Mo). Supabase fixe la validité du jeton à
// 2 heures ; il vaut pour ce seul chemin, et un second envoi au même chemin est refusé (pas d'upsert).
export default defineEventHandler(async (event) => {
  const { campagne, participation, service } = await contexteDepot(event)
  declarationValide(await readBody(event)) // inutile d'envoyer 20 Mo pour une déclaration refusée
  await limiter(event, 'depot')
  // Le chemin est choisi ici, jamais par le client.
  const chemin = `${campagne.id}/${participation.id}/${crypto.randomUUID()}.zip`
  const { data, error } = await service.storage.from('depots').createSignedUploadUrl(chemin)
  if (error) {
    console.error('URL d\'envoi :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de préparer l\'envoi. Réessaie dans un instant.' })
  }
  return { chemin, token: data.token }
})
