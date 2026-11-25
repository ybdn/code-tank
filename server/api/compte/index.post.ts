import { serverSupabaseServiceRole } from '#supabase/server'

// Création du compte de la personne connectée par GitHub (story 1.2). La session est vérifiée, la limite par IP passée,
// puis creer_compte (rôle de service seul, AD-1) reçoit l'id vérifié et la version de la charte du serveur. La base lit
// l'identité GitHub et revérifie tout ; le corps ne fournit que le pseudo et les deux cases.
export default defineEventHandler(async (event) => {
  // JSON seulement : un formulaire d'un autre site (CSRF) ne peut pas l'envoyer sans requête préalable CORS.
  if (getRequestHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw createError({ statusCode: 415, message: 'Envoie le formulaire au format JSON.' })
  }
  const { user } = await utilisateurVerifie(event)
  await limiter(event, 'compte')
  const corps = await readBody(event).catch(() => null)
  const { error } = await serverSupabaseServiceRole(event).rpc('creer_compte', {
    p_compte: user.id,
    p_pseudo: typeof corps?.pseudo === 'string' ? corps.pseudo.trim() : '',
    p_version_charte: VERSION_CHARTE,
    p_charte_acceptee: corps?.charte === true,
    p_majeur: corps?.majeur === true,
  })
  if (error) {
    // P0001 : règle métier, message fixe écrit par la fonction, jamais une valeur reçue.
    if (error.code === 'P0001') throw createError({ statusCode: 409, message: error.message })
    console.error('Création du compte :', error.code)
    throw createError({ statusCode: 500, message: 'Création du compte impossible pour le moment. Réessaie dans un instant.' })
  }
  return { ok: true }
})
