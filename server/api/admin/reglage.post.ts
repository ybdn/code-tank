import { serverSupabaseClient } from '#supabase/server'

// Règle le mode d'accès par regler_mode_acces, avec le JWT de l'admin : la fonction revérifie est_admin() et la valeur.
export default defineEventHandler(async (event) => {
  exigerJson(event)
  const corps = await readBody(event).catch(() => null)
  const mode = typeof corps?.mode === 'string' ? corps.mode : ''
  const { error } = await (await serverSupabaseClient(event)).rpc('regler_mode_acces', { p_mode: mode })
  if (error) {
    // P0001 : règle métier, message fixe écrit par la fonction, jamais une valeur reçue.
    if (error.code === 'P0001') throw createError({ statusCode: 409, message: error.message })
    console.error('Réglage du mode d\'accès :', error.code)
    throw createError({ statusCode: 500, message: 'Le mode d\'accès ne peut pas être enregistré pour le moment.' })
  }
  return { mode }
})
