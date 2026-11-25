import { createHash, randomUUID } from 'node:crypto'
import { serverSupabaseServiceRole } from '#supabase/server'

// URL d'envoi signée (story 3.3) : le zip va directement au bucket privé depots, il ne passe pas par le site (l'hébergeur
// plafonne le corps d'une requête vers 4,5 Mo). peut_deposer, avec le JWT de l'appelant, tient les mêmes gardes que deposer,
// sauf la limite de dépôts (contrôlée par deposer), et rend sa participation ; le chemin est construit ici, jamais reçu. Le
// jeton vaut pour ce seul chemin, 2 heures (Supabase).
export default defineEventHandler(async (event) => {
  const { client, user, id } = await campagneDeLInscrit(event)
  const { data: participation, error } = await client.rpc('peut_deposer', { p_campagne: id })
  if (error) erreurCampagne(error, 'Préparation d\'un dépôt :', 'L\'envoi ne peut pas être préparé. Réessaie dans un instant.')
  const service = serverSupabaseServiceRole(event)
  // Chaque URL permet un envoi de 20 Mo : 20 par compte et par 24 h, comme le débit de deposer (empreinte du compte).
  // La règle vit ici et non en SQL : seul le site signe un envoi, avec la clé de service.
  const { data: attente, error: erreurDebit } = await service.rpc('consommer_debit', {
    p_empreinte: createHash('sha256').update(`${user.id}:compte`).digest('hex'), p_action: 'envoi', p_maximum: 20, p_fenetre_s: 86_400,
  })
  if (erreurDebit || typeof attente !== 'number') {
    console.error('Limite d\'envoi :', erreurDebit?.code)
    throw createError({ statusCode: 503, message: 'Le service est indisponible pour le moment. Réessaie plus tard.' })
  }
  if (attente > 0) {
    setResponseHeader(event, 'retry-after', attente)
    throw createError({ statusCode: 429, message: 'Trop d\'envois depuis ton compte. Réessaie plus tard.' })
  }
  // shortcut: un objet envoyé mais jamais déposé (deposer refuse : 409, 429, réseau) reste dans le bucket ; objets_abandonnes
  // (AD-11, epic 6) l'effacera.
  const chemin = `${id}/${participation}/${randomUUID()}.zip`
  const { data, error: erreurStockage } = await service.storage.from('depots').createSignedUploadUrl(chemin)
  if (erreurStockage) {
    console.error('URL d\'envoi : échec du stockage.')
    throw createError({ statusCode: 500, message: 'L\'envoi ne peut pas être préparé. Réessaie dans un instant.' })
  }
  return { chemin, jeton: data.token }
})
