import type { H3Event } from 'h3'
import { serverSupabaseClient } from '#supabase/server'

// Le jeton de session est vérifié par Auth à chaque appel (getUser), pas seulement décodé.
// Le client renvoyé porte l'identité de l'utilisateur : la RLS s'applique à ses requêtes.
export async function utilisateurVerifie(event: H3Event) {
  const client = await serverSupabaseClient(event)
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw createError({ statusCode: 401, statusMessage: 'Connecte-toi avec GitHub.' })
  return { client, user: data.user }
}
