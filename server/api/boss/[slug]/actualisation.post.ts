import { createHash } from 'node:crypto'
import { serverSupabaseServiceRole } from '#supabase/server'

// Écran « le jury délibère » (story 4.7, AD-7) : à l'ouverture et au bouton Actualiser, le site déclenche le jury, une fois par
// minute au plus par campagne (pas par adresse : deux onglets du Boss comptent ensemble), puis rend la progression. Ordre : Boss
// (404), JSON (415), campagne en délibération (409 sinon), limite. Limite atteinte : pas d'appel, et 200 avec la progression
// (`etat: 'attente'`) : un double clic n'est pas une erreur. Une panne de la limite n'appelle pas le jury (`etat: 'echec'`).
export default defineEventHandler(async (event) => {
  const { client, campagne } = await campagneDuBoss(event)
  exigerJson(event)
  if (campagne.statut !== 'deliberation') throw createError({ statusCode: 409, message: 'La campagne n\'est pas en délibération.' })
  const { data: attente, error: erreurDebit } = await serverSupabaseServiceRole(event).rpc('consommer_debit', {
    // shortcut: les lignes debit des campagnes finies ne sont purgées qu'à leur prochain appel (jamais) ; la purge globale vient
    // avec les tâches de conservation (epic 6).
    p_empreinte: createHash('sha256').update(`${campagne.id}:actualisation`).digest('hex'),
    p_action: 'actualisation',
    p_maximum: 1,
    p_fenetre_s: 60,
  })
  if (erreurDebit) console.error('Limite de l\'actualisation :', erreurDebit.code)
  const etat = erreurDebit ? 'echec' : attente === 0 ? (await appelerJury(event, 'bouton')).etat : 'attente'
  const { data, error } = await client.rpc('progression_deliberation', { p_campagne: campagne.id })
  if (error) erreurCampagne(error, 'Lecture de la progression :', 'La progression ne peut pas être lue pour le moment.')
  return { etat, progression: data as Progression }
})
