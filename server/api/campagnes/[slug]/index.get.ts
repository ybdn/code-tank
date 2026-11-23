import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const { data, error } = await (await serverSupabaseClient(event))
    .from('campagne')
    .select('id, slug, titre, theme, brief, criteres, statut, ouverture_inscriptions, cloture_depot, date_resultats, max_participants')
    .eq('slug', getRouterParam(event, 'slug') ?? '')
    .maybeSingle()
  if (error) {
    console.error('Lecture de la campagne :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'La campagne ne peut pas être lue pour le moment.' })
  }
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Campagne introuvable.' })
  return data
})
