// Suppression du compte par son titulaire (SPECS § 9) : contrôles, limite, puis la routine commune (server/utils/compte.ts).
export default defineEventHandler(async (event) => {
  const { client, user } = await utilisateurVerifie(event)
  const { pseudo } = (await readBody(event)) ?? {}
  const { data: compte } = await client.from('compte').select('pseudo, role').eq('id', user.id).maybeSingle()
  if (!compte) throw createError({ statusCode: 404, statusMessage: 'Compte introuvable.' })
  if (compte.role === 'organisateur') {
    throw createError({ statusCode: 403, statusMessage: 'Le compte de l\'organisateur ne se supprime pas depuis le site.' })
  }
  if (pseudo !== compte.pseudo) {
    throw createError({ statusCode: 422, statusMessage: 'Le pseudo saisi ne correspond pas.', data: { erreurs: { pseudo: 'Saisis ton pseudo exactement, pour confirmer.' } } })
  }
  await limiter(event, 'suppression')

  await supprimerCompte(event, user.id)
  return { ok: true }
})
