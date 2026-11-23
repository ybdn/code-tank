import { serverSupabaseServiceRole } from '#supabase/server'

// Seule action d'administration qui prend la clé de service : une URL de lecture signée de 60 secondes. Le chemin vient de la base,
// lu avec la session de l'organisateur. Rien n'est exécuté : l'archive se télécharge, c'est tout (SPECS § 4).
export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const id = uuidDe(event, 'id')
  const [depot, reception] = await Promise.all([
    client.from('depot').select('chemin_stockage').eq('participation_id', id).maybeSingle(),
    client.from('reception').select('chemin_stockage').eq('participation_id', id).maybeSingle(),
  ])
  const chemin = depot.data?.chemin_stockage ?? reception.data?.chemin_stockage
  if (!chemin) throw createError({ statusCode: 404, statusMessage: 'Aucune archive pour cette participation.' })
  const { data, error } = await serverSupabaseServiceRole(event).storage.from('depots').createSignedUrl(chemin, 60, { download: true })
  if (error) {
    console.error('URL de lecture :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'L\'URL de téléchargement n\'a pas pu être créée.' })
  }
  return { url: data.signedUrl }
})
