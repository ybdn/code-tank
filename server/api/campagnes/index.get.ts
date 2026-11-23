import { serverSupabaseClient } from '#supabase/server'

// Campagnes lisibles de tous (la RLS cache les brouillons). Lues côté serveur : le client Supabase de la page
// ne sait pas lire la session pendant le rendu serveur.
export default defineEventHandler(async (event) => {
  const { data, error } = await (await serverSupabaseClient(event))
    .from('campagne')
    .select('slug, titre, theme, statut, cloture_depot')
    .order('ouverture_inscriptions', { ascending: false })
  if (error) {
    console.error('Lecture des campagnes :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'Les campagnes ne peuvent pas être lues pour le moment.' })
  }
  return data
})
