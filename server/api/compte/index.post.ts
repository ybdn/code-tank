// Création du compte de la personne connectée par GitHub (story 1.2). La base (creer_compte) lit l'identité GitHub et
// revérifie tout ; le corps ne fournit que le pseudo et les deux cases, la version de la charte vient du serveur.
export default defineEventHandler(async (event) => {
  const { client } = await utilisateurVerifie(event)
  await limiter(event, 'compte')
  const corps = await readBody(event).catch(() => null)
  const { error } = await client.rpc('creer_compte', {
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
