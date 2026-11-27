// Campagne du Boss : 404 pour tout autre compte et pour le visiteur. `compte_actif` dit à la page si elle propose réglage
// et suppression (un Boss suspendu lit encore sa campagne, mais les RPC le refusent). `inscrits` (story 2.3), lu dans
// campagne_phase (le Boss n'y lit pas les participations des autres) : 0 pour un brouillon, hors de la vue et sans inscrit.
// Campagne prete pas encore prévenue (story 4.7, AD-12) : le site constate la fin et envoie l'e-mail au Boss, sans retenir la
// réponse (prevenirFin ne lève jamais ; reserver_envoi garantit un seul envoi).
export default defineEventHandler(async (event) => {
  const { client, campagne } = await campagneDuBoss(event)
  if (campagne.statut === 'prete' && !campagne.fin_prevenue_le) event.waitUntil(prevenirFin(event, campagne.id))
  const [actif, phase] = await Promise.all([
    client.rpc('compte_actif'),
    client.from('campagne_phase').select('max_participants, places_restantes').eq('id', campagne.id).maybeSingle(),
  ])
  if (actif.error || phase.error) erreurCampagne((actif.error ?? phase.error)!, 'Lecture de l\'état du compte :', 'La campagne ne peut pas être lue pour le moment.')
  const inscrits = phase.data ? (phase.data.max_participants ?? 0) - (phase.data.places_restantes ?? 0) : 0
  return { ...campagne, compte_actif: actif.data === true, inscrits }
})
