// Départage, disqualification (publics) ou fermeture de compte, avec une justification obligatoire.
const TYPES = ['departage', 'disqualification', 'fermeture_compte'] as const

export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const id = uuidDe(event, 'id')
  const corps = await corpsObjet(event)
  const justification = typeof corps.justification === 'string' ? corps.justification.trim() : ''
  const erreurs: Record<string, string> = {}
  if (!TYPES.includes(corps.type as (typeof TYPES)[number])) erreurs.type = 'Choisis le type de décision.'
  if (justification.length < 1 || justification.length > 2000) erreurs.justification = 'La justification est obligatoire (2 000 caractères au plus).'
  if (Object.keys(erreurs).length) throw invalide(erreurs)
  const { error } = await client.rpc('enregistrer_decision', { p_participation_id: id, p_type: corps.type as (typeof TYPES)[number], p_justification: justification })
  if (error?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'Cette décision existe déjà pour cette participation.' })
  if (error) throw erreurAdmin(error, 'Enregistrement de la décision impossible.')
  return { ok: true }
})
