import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const { user } = await utilisateurVerifie(event)

  // app_metadata n'est écrit que par l'administrateur d'Auth : le client ne peut pas s'y faire passer pour GitHub.
  if (user.app_metadata?.provider !== 'github') {
    throw createError({ statusCode: 403, statusMessage: 'Seule la connexion GitHub permet de créer un compte.' })
  }
  // Jamais user_metadata (modifiable par l'utilisateur) : l'identité GitHub vient de l'identité liée,
  // ou, à défaut, de app_metadata.
  const githubId = String(
    user.identities?.find((i) => i.provider === 'github')?.identity_data?.provider_id ?? user.app_metadata?.github_id ?? '',
  )
  if (!githubId) throw createError({ statusCode: 403, statusMessage: 'Identité GitHub introuvable.' })

  const config = useRuntimeConfig(event)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.versionCharte)) {
    throw createError({ statusCode: 503, statusMessage: 'La version de la charte n\'est pas configurée (NUXT_VERSION_CHARTE).' })
  }

  const corps = await readBody(event)
  const { profil, erreurs } = validerCreation(typeof corps === 'object' && corps ? corps : {})
  if (!erreurs.email_contact && adresseJetable(profil.email_contact)) {
    erreurs.email_contact = 'Les adresses jetables ne sont pas acceptées.'
  }
  if (Object.keys(erreurs).length) throw createError({ statusCode: 422, statusMessage: 'Formulaire invalide.', data: { erreurs } })

  const maintenant = new Date().toISOString()
  // La clé de service ne sort pas d'ici ; id et github_id viennent de l'identité vérifiée.
  const { error } = await serverSupabaseServiceRole(event)
    .from('compte')
    .insert({
      id: user.id,
      github_id: githubId,
      github_donnees: await lireGithub(config.githubApi, githubId),
      ...profil,
      majeur_declare_le: maintenant,
      charte_acceptee_le: maintenant,
      version_charte: config.versionCharte,
    })
  if (error) {
    if (error.code === '23505') {
      const pseudo = error.message.includes('pseudo')
      throw createError({
        statusCode: 409,
        statusMessage: pseudo ? 'Ce pseudo est déjà pris.' : 'Un compte existe déjà pour cette identité GitHub.',
        data: pseudo ? { erreurs: { pseudo: 'Ce pseudo est déjà pris.' } } : undefined,
      })
    }
    console.error('Création du compte :', error.message)
    throw createError({ statusCode: 500, statusMessage: 'Création du compte impossible.' })
  }

  let courrielEnvoye = true
  try {
    await envoyerLienVerification(config, user.id, profil.email_contact)
  } catch (e) {
    courrielEnvoye = false
    console.error('Envoi du lien de vérification :', e instanceof Error ? e.message : e)
  }
  return { courrielEnvoye }
})
