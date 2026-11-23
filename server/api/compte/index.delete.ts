import { serverSupabaseServiceRole } from '#supabase/server'

// Suppression du compte par son titulaire (SPECS § 9). Ordre : contrôles, archives du stockage, puis l'utilisateur Auth.
// Les clés étrangères et le déclencheur participation_apres_depart effacent ou anonymisent le reste, dans une seule transaction.
export default defineEventHandler(async (event) => {
  const { client, user } = await utilisateurVerifie(event)
  const { pseudo } = (await readBody(event)) ?? {}
  const { data: compte } = await client.from('compte').select('pseudo, role').eq('id', user.id).maybeSingle()
  if (!compte) throw createError({ statusCode: 404, statusMessage: 'Compte introuvable.' })
  if (compte.role === 'organisateur') {
    throw createError({ statusCode: 403, statusMessage: 'Le compte de l\'organisateur ne se supprime pas depuis le site.' })
  }
  if (pseudo !== compte.pseudo) {
    throw createError({ statusCode: 422, statusMessage: 'Le pseudo saisi ne correspond pas.', data: { erreurs: { pseudo: 'Saisis ton pseudo exactement, pour confirmer.' } } })
  }
  await limiter(event, 'suppression')

  // Toutes les archives des participations du compte, y compris les envois jamais confirmés. Si le stockage échoue,
  // la fonction lève une 500 et ni le compte ni la base ne sont touchés.
  const service = serverSupabaseServiceRole(event)
  const { data: participations, error } = await service.from('participation').select('id, campagne_id').eq('compte_id', user.id)
  if (error) {
    console.error('Lecture des participations :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'Suppression impossible pour le moment. Réessaie dans un instant.' })
  }
  for (const p of participations) {
    const [depot, reception] = await Promise.all([
      service.from('depot').select('chemin_stockage').eq('participation_id', p.id).maybeSingle(),
      service.from('reception').select('chemin_stockage').eq('participation_id', p.id).maybeSingle(),
    ])
    await effacerArchives(event, p.campagne_id, p.id, [depot.data?.chemin_stockage, reception.data?.chemin_stockage])
  }

  const { error: erreurAuth } = await service.auth.admin.deleteUser(user.id)
  if (erreurAuth) {
    console.error('Suppression de l\'utilisateur :', erreurAuth.message)
    throw createError({ statusCode: 500, statusMessage: 'Ton compte n\'a pas pu être supprimé. Réessaie, ou écris à support@ybdn.io.' })
  }
  return { ok: true }
})
