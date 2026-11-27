import { serverSupabaseClient } from '#supabase/server'

// Mode d'accès courant. Réservé à l'admin par server/middleware/admin.ts et par la RLS de reglage (est_admin()).
export default defineEventHandler(async (event) => {
  const { data, error } = await (await serverSupabaseClient(event)).from('reglage').select('mode_acces').single()
  if (error) {
    console.error('Lecture du mode d\'accès :', error.code)
    throw createError({ statusCode: 500, message: 'Le mode d\'accès ne peut pas être lu pour le moment.' })
  }
  return { mode: data.mode_acces }
})
