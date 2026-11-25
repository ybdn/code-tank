// Inscription par sinscrire, avec le JWT de l'appelant : la fonction tient toutes les règles (verrou de la campagne, compte
// actif, phase, Boss juge, prise de connaissance de l'envoi à Anthropic, places, limite de débit par compte en 429). Jeton
// d'invitation facultatif (story 2.4) : hors forme, 404 ; une campagne publique l'ignore.
export default defineEventHandler(async (event) => {
  exigerJson(event)
  const corps = await readBody(event).catch(() => null)
  const jeton = corps?.jeton == null ? undefined : jetonValide(corps.jeton)
  const { client, id } = await campagneDeLInscrit(event, jeton)
  const { error } = await client.rpc('sinscrire', { p_campagne: id, p_connaissance: corps?.connaissance === true, p_jeton: jeton })
  if (error) erreurCampagne(error, 'Inscription :', 'L\'inscription a échoué. Réessaie dans un instant.')
  return { ok: true }
})
