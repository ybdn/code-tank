// Campagne d'un lien d'invitation (story 2.4), pour un compte connecté : jeton hors forme 404 avant tout appel, sans session
// 401, puis lire_invitation (jeton inconnu ou régénéré, campagne bloquée, brouillon ou expirée : 404). La réponse a la forme
// de /api/campagnes/[slug] et ne contient jamais le jeton.
// Pas de limite de débit : 256 bits aléatoires ne se devinent pas par essais.
export default defineEventHandler(async (event) => {
  const jeton = jetonValide(getRouterParam(event, 'jeton', { decode: true }))
  const { client, user } = await utilisateurVerifie(event)
  return pageCampagne(event, client, user.id, client.rpc('lire_invitation', { p_jeton: jeton }).maybeSingle().then(({ data, error }) => {
    if (error) erreurCampagne(error, 'Lecture d\'une invitation :', 'La campagne ne peut pas être lue pour le moment.')
    return data as CampagnePublique & { id: string } | null
  }))
})
