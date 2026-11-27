import { serverSupabaseServiceRole } from '#supabase/server'

// Pire cas de la délibération (story 4.2, SPECS § 6, AD-6), pour le Boss de la campagne seul (404 sinon). Tant que la
// délibération ne peut pas se lancer (campagne ni ouverte ni en délibération sans clé, bloquée, échue, à moins de 48 h des
// résultats, dépôts pas clos, réception en attente de contrôle, trois lancements faits, clé déjà rangée, aucun dépôt à
// auditer : les refus de lancer_deliberation, story 4.3), un état « pas encore » avec sa raison, pas une erreur. Sinon estimer_pire_cas, avec le JWT du Boss : les tarifs
// n'existent qu'en SQL (AD-5).
export default defineEventHandler(async (event) => {
  const { client, campagne } = await campagneDuBoss(event)
  const pasEncore = (raison: string) => ({ disponible: false as const, raison })
  // Formulaire voué au refus : lancer_deliberation refuse un compte non actif (suspendu, en attente).
  const { data: actif, error: erreurCompte } = await client.rpc('compte_actif')
  if (erreurCompte) erreurCampagne(erreurCompte, 'Lecture de l\'état du compte :', 'L\'estimation ne peut pas être calculée pour le moment.')
  if (actif !== true) return pasEncore('Ton compte n\'est pas actif.')
  // Relance : en délibération sans clé (clé effacée), la délibération se relance jusqu'à trois fois.
  if (campagne.statut !== 'ouverte' && campagne.statut !== 'deliberation') return pasEncore('La délibération se lance quand la campagne est ouverte et ses dépôts clos.')
  if (campagne.cle_fin) return pasEncore('Le jury délibère : une clé est déjà rangée.')
  if (campagne.lancements >= 3) return pasEncore('Les trois lancements de la délibération sont consommés.')
  if (campagne.bloquee_le) return pasEncore('La campagne est bloquée.')
  if (Date.parse(campagne.date_resultats) < Date.now()) return pasEncore('La date des résultats est passée.')
  // Formulaire voué au refus : lancer_deliberation (story 4.3) refusera tout lancement à moins de 48 h exactes des résultats
  // (now() > date_resultats - interval '48 hours'). Une durée en heures, pas en jours : pas d'écart au changement d'heure.
  if (Date.now() > Date.parse(campagne.date_resultats) - 48 * 3600 * 1000) return pasEncore('Moins de 2 jours avant les résultats : la délibération ne peut plus partir.')
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
  // Déjà dépensé par les lancements précédents (plafond cumulé, AD-5) : somme des cout_usd, par depense_audits avec le JWT du Boss.
  let depense = 0
  if (campagne.lancements > 0) {
    const { data: somme, error: erreurAudit } = await client.rpc('depense_audits', { p_campagne: campagne.id })
    if (erreurAudit) erreurCampagne(erreurAudit, 'Lecture du dépensé :', 'L\'estimation ne peut pas être calculée pour le moment.')
    depense = Number(somme)
  }
  return { disponible: true as const, pire_cas_usd: Number(data), depense_usd: depense }
})
