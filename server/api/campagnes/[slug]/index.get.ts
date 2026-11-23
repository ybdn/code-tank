const COLONNES = 'id,slug,titre,theme,brief,criteres,statut,ouverture_inscriptions,cloture_depot,date_resultats,max_participants'

export default defineEventHandler(async (event) => {
  const slug = encodeURIComponent(getRouterParam(event, 'slug') ?? '')
  const [campagne] = await lirePublic<Campagne[]>(event, `campagne?select=${COLONNES}&slug=eq.${slug}&limit=1`)
  if (!campagne) throw createError({ statusCode: 404, statusMessage: 'Campagne introuvable.' })
  return campagne
})
