// Inscription par sinscrire, avec le JWT de l'appelant : la fonction tient toutes les règles (verrou de la campagne, compte
// actif, phase, Boss juge, prise de connaissance de l'envoi à Anthropic, places, limite de débit par compte en 429). Jeton
// d'invitation facultatif (story 2.4) : hors forme, 404 ; une campagne publique l'ignore.
export default defineEventHandler(async (event) => {
  // Avant de lire le corps (campagneDeLInscrit le revérifie, pour la route DELETE qui la partage aussi).
  exigerJson(event)
  const corps = await readBody(event).catch(() => null)
  const { client, id, jeton } = await campagneDeLInscrit(event, corps?.jeton)
  const { error } = await client.rpc('sinscrire', { p_campagne: id, p_connaissance: corps?.connaissance === true, p_jeton: jeton })
  if (error) erreurCampagne(error, 'Inscription :', 'L\'inscription a échoué. Réessaie dans un instant.')
  return { ok: true }
})
