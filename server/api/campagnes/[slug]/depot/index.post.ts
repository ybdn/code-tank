// Enregistre la réception d'un zip déjà envoyé au stockage, avec la déclaration. Le contrôle du zip
// (format, secrets, licence, tokens) est fait ailleurs, à partir de la table reception.
export default defineEventHandler(async (event) => {
  const { campagne, participation, service } = await contexteDepot(event)
  const corps = (await readBody(event)) ?? {}
  const declaration = declarationValide(corps)

  // Le chemin vient du client : il doit être un de ceux que le serveur a délivrés à cette participation.
  const dossier = `${campagne.id}/${participation.id}/`
  const chemin = typeof corps.chemin === 'string' ? corps.chemin : ''
  if (!chemin.startsWith(dossier) || !/^[0-9a-f-]{36}\.zip$/.test(chemin.slice(dossier.length))) {
    throw createError({ statusCode: 422, statusMessage: 'Envoi inconnu : recommence le dépôt.' })
  }
  const fichier = chemin.slice(dossier.length)
  const { data: objets, error: erreurStockage } = await service.storage.from('depots').list(dossier.slice(0, -1), { search: fichier })
  if (erreurStockage) {
    console.error('Lecture du stockage :', erreurStockage.message)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de vérifier ton envoi. Réessaie dans un instant.' })
  }
  if (!objets.some((o) => o.name === fichier)) {
    throw createError({ statusCode: 422, statusMessage: 'Ton archive n\'est pas arrivée : recommence l\'envoi.' })
  }

  // Une nouvelle réception remplace l'ancienne ; le dépôt déjà accepté, lui, reste valable jusqu'au prochain contrôle.
  const { data: depot } = await service.from('depot').select('chemin_stockage').eq('participation_id', participation.id).maybeSingle()
  const { error } = await service.from('reception').upsert({
    participation_id: participation.id,
    chemin_stockage: chemin,
    ...declaration,
    declaration_code_le: new Date().toISOString(),
    etat: 'en_attente',
    motifs_refus: [],
    recue_le: new Date().toISOString(),
    traitee_le: null,
  }, { onConflict: 'participation_id' })
  if (error) {
    console.error('Enregistrement de la réception :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'Enregistrement impossible. Réessaie dans un instant.' })
  }
  await effacerArchives(event, campagne.id, participation.id, [], [chemin, depot?.chemin_stockage])
  // Le jury traite la réception sans que le candidat attende : la réponse part tout de suite.
  event.waitUntil(appelerJury(event, 'reception'))
  return { ok: true }
})
