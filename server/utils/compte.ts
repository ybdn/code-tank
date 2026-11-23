import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

// La seule routine qui supprime un compte (DELETE /api/compte et tâches de conservation) : d'abord toutes les archives du
// stockage, y compris les envois jamais confirmés ; si le stockage échoue, rien d'autre n'est touché. Puis l'utilisateur Auth :
// les clés étrangères et le déclencheur participation_apres_depart font le reste, dans une seule transaction.
// Le compte de l'organisateur n'est jamais supprimé par elle.
export async function supprimerCompte(event: H3Event, id: string) {
  const service = serverSupabaseServiceRole(event)
  const { data: compte } = await service.from('compte').select('role').eq('id', id).maybeSingle()
  if (compte?.role === 'organisateur') throw createError({ statusCode: 403, statusMessage: 'Le compte de l\'organisateur ne se supprime pas.' })

  const { data: participations, error } = await service.from('participation').select('id, campagne_id').eq('compte_id', id)
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

  const { error: erreurAuth } = await service.auth.admin.deleteUser(id)
  if (erreurAuth) {
    console.error('Suppression de l\'utilisateur :', erreurAuth.message)
    throw createError({ statusCode: 500, statusMessage: 'Ton compte n\'a pas pu être supprimé. Réessaie, ou écris à support@ybdn.io.' })
  }
}
