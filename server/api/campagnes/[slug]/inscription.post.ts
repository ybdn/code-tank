// Inscription par sinscrire, avec le JWT de l'appelant : la fonction tient toutes les règles (verrou de la campagne, compte
// actif, phase, Boss juge, prise de connaissance de l'envoi à Anthropic, places, limite de débit par compte en 429).
export default defineEventHandler(async (event) => {
  const { client, id } = await campagneDeLInscrit(event)
  const corps = await readBody(event).catch(() => null)
  const { error } = await client.rpc('sinscrire', { p_campagne: id, p_connaissance: corps?.connaissance === true })
  if (error) erreurCampagne(error, 'Inscription :', 'L\'inscription a échoué. Réessaie dans un instant.')
  return { ok: true }
})
