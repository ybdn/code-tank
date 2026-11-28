import { serverSupabaseServiceRole } from '#supabase/server'

// Archive filtrée d'un dépôt (story 5.1, SPECS § 7, AD-9), pour le Boss juge de la campagne, en délibération ou prête.
// journaliser_telechargement, avec le JWT du Boss, tient toutes les gardes, écrit la trace (qui, quoi, quand) et rend le chemin ;
// tout refus est le même 404. Le site signe ensuite un lien de téléchargement de 60 s avec la clé de service (AD-1) ; la page
// l'ouvre. Si la signature échoue, la trace reste : un essai compte.
export default defineEventHandler(async (event) => {
  // Paramètre hors de la forme d'un uuid (caractère nul, UTF-8 invalide…) : 404 tout de suite, sans appel à la base.
  const depot = getRouterParam(event, 'depot', { decode: true }) ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(depot)) throw createError({ statusCode: 404, message: 'Archive introuvable.' })
  const { client, campagne } = await campagneDuBoss(event)
  const { data: chemin, error } = await client.rpc('journaliser_telechargement', { p_campagne: campagne.id, p_depot: depot })
  if (error) erreurCampagne(error, 'Téléchargement d\'une archive :', 'L\'archive ne peut pas être téléchargée pour le moment.')
  const { data, error: erreurStockage } = await serverSupabaseServiceRole(event).storage.from('depots').createSignedUrl(chemin, 60, { download: true })
  if (erreurStockage) {
    console.error('Lien d\'une archive : échec du stockage.')
    throw createError({ statusCode: 503, message: 'L\'archive ne peut pas être téléchargée pour le moment. Réessaie dans un instant.' })
  }
  return { url: data.signedUrl }
})
