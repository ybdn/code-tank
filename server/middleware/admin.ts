import { serverSupabaseClient } from '#supabase/server'

// /admin et /api/admin/** (AD-3) : 404 pour tout compte qui n'est pas admin, visiteur compris. est_admin() est appelée avec
// la session de l'utilisateur : la base lit l'appelant dans le JWT. Une session absente ou expirée donne aussi 404.
export default defineEventHandler(async (event) => {
  // Le chemin est comparé décodé, barres obliques regroupées, sans casse, comme le routeur le résout (%61dmin, //admin, /ADMIN).
  let chemin: string
  try {
    chemin = decodeURIComponent(getRequestURL(event).pathname).replace(/\/+/g, '/')
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Page introuvable' })
  }
  if (!/^\/(api\/)?admin(\/|$)/i.test(chemin)) return
  const { data } = await (await serverSupabaseClient(event)).rpc('est_admin')
  if (data !== true) throw createError({ statusCode: 404, statusMessage: 'Page introuvable' })
})
