import { serverSupabaseServiceRole } from '#supabase/server'

// Appelée une fois par jour par le planificateur de l'hébergeur (vercel.json). Les tâches de conservation reviendront avec
// le schéma qu'elles purgent (epic 6). Elle déclenche aussi le jury, filet d'AD-7 si un appel après dépôt s'est perdu ; sans
// attendre sa réponse ni échouer avec lui (appelerJury ne lève jamais). Elle clôture enfin toute clé du Boss de plus de 48 h ou
// dont la campagne n'est plus en délibération (story 4.6, AD-4 (4)). Réponse : des compteurs, jamais une donnée personnelle.
export default defineEventHandler(async (event) => {
  verifierCron(event)
  event.waitUntil(appelerJury(event, 'cron'))
  const { data, error } = await serverSupabaseServiceRole(event).rpc('cloturer_cles_expirees')
  if (error) {
    console.error('Clôture des clés expirées :', error.code)
    throw createError({ statusCode: 500, message: 'Les clés expirées n\'ont pas pu être clôturées.' })
  }
  return { cles_cloturees: data as number }
})
