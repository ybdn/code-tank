// Vote du Boss : note de 0 à 10 et commentaire, créés ou modifiés avec la session de l'organisateur. La base refuse
// hors délibération (RLS) et après verrouillage (déclencheur).
export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const id = uuidDe(event, 'id')
  const corps = await corpsObjet(event)
  const commentaire = typeof corps.commentaire === 'string' ? corps.commentaire.trim() : ''
  const erreurs: Record<string, string> = {}
  if (typeof corps.note !== 'number' || !Number.isInteger(corps.note) || corps.note < 0 || corps.note > 10) erreurs.note = 'La note est un entier de 0 à 10.'
  if (commentaire.length > 2000) erreurs.commentaire = 'Le commentaire fait 2 000 caractères au plus.'
  if (Object.keys(erreurs).length) throw invalide(erreurs)

  const { data: depot } = await client.from('depot').select('id').eq('participation_id', id).maybeSingle()
  if (!depot) throw createError({ statusCode: 409, statusMessage: 'Cette participation n\'a pas de dépôt à noter.' })
  const { data: existant } = await client.from('vote_boss').select('participation_id').eq('participation_id', id).maybeSingle()
  // Pas d'upsert : il réécrirait la clé, dont l'organisateur n'a pas le droit de modification.
  const valeurs = { note: corps.note as number, commentaire: commentaire || null }
  const { error } = existant
    ? await client.from('vote_boss').update(valeurs).eq('participation_id', id)
    : await client.from('vote_boss').insert({ participation_id: id, ...valeurs })
  if (error) throw erreurAdmin(error, 'Enregistrement du vote impossible.')
  return { ok: true }
})
