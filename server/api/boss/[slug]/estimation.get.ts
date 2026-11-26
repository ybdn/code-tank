import { serverSupabaseServiceRole } from '#supabase/server'

// Pire cas de la délibération (story 4.2, SPECS § 6, AD-6), pour le Boss de la campagne seul (404 sinon). Tant que la
// délibération ne peut pas se lancer (campagne non ouverte, bloquée, échue, dépôts pas clos, réception en attente de
// contrôle), un état « pas encore » avec sa raison, pas une erreur. Sinon estimer_pire_cas, avec le JWT du Boss : les tarifs
// n'existent qu'en SQL (AD-5).
export default defineEventHandler(async (event) => {
  const { client, campagne } = await campagneDuBoss(event)
  const pasEncore = (raison: string) => ({ disponible: false as const, raison })
  if (campagne.statut !== 'ouverte') return pasEncore('La délibération se lance quand la campagne est ouverte et ses dépôts clos.')
  if (campagne.bloquee_le) return pasEncore('La campagne est bloquée.')
  if (Date.parse(campagne.date_resultats) < Date.now()) return pasEncore('La date des résultats est passée.')
  if (Date.parse(campagne.cloture_depot) > Date.now()) return pasEncore('Les dépôts ne sont pas encore clos.')
  // Le Boss ne lit pas les réceptions des candidats (RLS) : lecture avec la clé de service, après la garde du Boss.
  const { count, error: erreurReception } = await serverSupabaseServiceRole(event).from('reception')
    .select('id, participation!inner(campagne_id)', { count: 'exact', head: true })
    .eq('statut', 'en_attente').eq('participation.campagne_id', campagne.id)
  if (erreurReception) erreurCampagne(erreurReception, 'Lecture des réceptions :', 'L\'estimation ne peut pas être calculée pour le moment.')
  if (count) return pasEncore('Un dépôt est encore en cours de contrôle.')
  const { data, error } = await client.rpc('estimer_pire_cas', { p_campagne: campagne.id })
  if (error) erreurCampagne(error, 'Estimation du pire cas :', 'L\'estimation ne peut pas être calculée pour le moment.')
  if (!Number(data)) return pasEncore('Aucun dépôt à auditer.')
  return { disponible: true as const, pire_cas_usd: Number(data) }
})
