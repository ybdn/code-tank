export default defineEventHandler(async (event) => {
  const { client, user } = await utilisateurVerifie(event)
  const { data: compte } = await client.from('compte').select('email_contact, email_verifie_le').eq('id', user.id).maybeSingle()
  if (!compte) throw createError({ statusCode: 404, statusMessage: 'Compte introuvable.' })
  if (compte.email_verifie_le) throw createError({ statusCode: 409, statusMessage: 'Ton adresse est déjà vérifiée.' })
  // Une adresse écrite sans passer par le site (jetable, malformée, plusieurs adresses) ne reçoit rien.
  if (!adresseUtilisable(compte.email_contact)) {
    throw createError({ statusCode: 422, statusMessage: 'Cette adresse n\'est pas acceptée : corrige-la dans ton profil.' })
  }
  await limiter(event, 'verification')
  try {
    await envoyerLienVerification(useRuntimeConfig(event), user.id, compte.email_contact)
  } catch (e) {
    console.error('Envoi du lien de vérification :', e instanceof Error ? e.message : e)
    throw createError({ statusCode: 502, statusMessage: 'L\'e-mail n\'a pas pu partir. Réessaie dans un instant.' })
  }
  return { ok: true }
})
