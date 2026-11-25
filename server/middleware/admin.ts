import { serverSupabaseClient } from '#supabase/server'

// /admin et /api/admin/** (AD-3) : 404 pour tout compte qui n'est pas admin, visiteur compris. est_admin() est appelée avec
// la session de l'utilisateur : la base lit l'appelant dans le JWT. Une session absente ou expirée donne aussi 404.
export default defineEventHandler(async (event) => {
  if (!/^\/(api\/)?admin(\/|$)/i.test(getRequestURL(event).pathname)) return
  const { data } = await (await serverSupabaseClient(event)).rpc('est_admin')
  if (data !== true) throw createError({ statusCode: 404, statusMessage: 'Page introuvable' })
})
