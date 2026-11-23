const CHAMPS: ChampProfil[] = ['vrai_nom', 'pseudo', 'email_contact', 'motivation', 'depot_cite_url']

export default defineEventHandler(async (event) => {
  const { client, user } = await utilisateurVerifie(event)
  const corps = (await readBody(event)) ?? {}
  // Seuls les champs de profil envoyés sont modifiés ; les droits de colonnes restent ceux de la base.
  const propres = nettoyerProfil(corps)
  const patch = Object.fromEntries(CHAMPS.filter((c) => typeof corps[c] === 'string').map((c) => [c, propres[c]])) as Partial<Profil>
  const erreurs = validerProfil(patch)
  if (patch.email_contact && !erreurs.email_contact && adresseJetable(patch.email_contact)) {
    erreurs.email_contact = 'Les adresses jetables ne sont pas acceptées.'
  }
  if (!Object.keys(patch).length) throw createError({ statusCode: 400, statusMessage: 'Rien à modifier.' })
  if (Object.keys(erreurs).length) throw createError({ statusCode: 422, statusMessage: 'Formulaire invalide.', data: { erreurs } })

  // Lecture et écriture par la session de l'utilisateur : la RLS décide.
  const { data: avant } = await client.from('compte').select('email_contact').eq('id', user.id).maybeSingle()
  if (!avant) throw createError({ statusCode: 404, statusMessage: 'Compte introuvable.' })
  // Un changement d'adresse fait envoyer un lien à un tiers possible : il passe par la limite du renvoi, avant toute écriture.
  if (patch.email_contact && patch.email_contact !== avant.email_contact) await limiter(event, 'verification')
  const { error } = await client.from('compte').update(patch).eq('id', user.id)
  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Ce pseudo est déjà pris.', data: { erreurs: { pseudo: 'Ce pseudo est déjà pris.' } } })
    }
    if (error.message.includes('pseudo ne se modifie plus')) {
      throw createError({ statusCode: 409, statusMessage: error.message, data: { erreurs: { pseudo: error.message } } })
    }
    console.error('Modification du profil :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'Modification impossible.' })
  }

  // La base annule la vérification quand l'adresse change : on renvoie un lien à la nouvelle.
  let courrielEnvoye: boolean | null = null
  if (patch.email_contact && patch.email_contact !== avant.email_contact) {
    try {
      await envoyerLienVerification(useRuntimeConfig(event), user.id, patch.email_contact)
      courrielEnvoye = true
    } catch (e) {
      courrielEnvoye = false
      console.error('Envoi du lien de vérification :', e instanceof Error ? e.message : e)
    }
  }
  return { courrielEnvoye }
})
