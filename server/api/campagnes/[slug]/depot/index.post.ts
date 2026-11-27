// Dépôt (story 3.3) : le zip est déjà dans le bucket, au chemin rendu par url.post. deposer, avec le JWT de l'appelant, tient
// toutes les règles (verrou de la campagne, phase, compte actif, Boss juge, inscription, case, présentation, demande, chemin
// et objet présent, réception en attente, limite de débit par compte en 429). Puis le jury est appelé sans attendre : un
// échec laisse la réception en_attente, sans erreur pour le candidat (prive la reprendra au prochain passage).
export default defineEventHandler(async (event) => {
  exigerJson(event)
  const corps = await readBody(event).catch(() => null)
  const { client, id } = await campagneDeLInscrit(event)
  const { error } = await client.rpc('deposer', {
    p_campagne: id,
    p_chemin: texteRecu(corps?.chemin),
    p_presentation: texteRecu(corps?.presentation),
    p_demande: texteRecu(corps?.demande),
    p_droit_declare: corps?.droit === true,
  })
  if (error) erreurCampagne(error, 'Dépôt :', 'Le dépôt a échoué. Réessaie dans un instant.')
  event.waitUntil(appelerJury(event, 'reception'))
  return { ok: true }
})
