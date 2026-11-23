// Inscription : la fonction SQL sinscrire (session de l'utilisateur) contrôle tout ; ce serveur y ajoute la limite de débit.
// La fonction reste appelable directement depuis un navigateur : une inscription par compte et par campagne, compte autorisé à la main.
export default defineEventHandler(async (event) => {
  const { client } = await utilisateurVerifie(event)
  const { data: campagne } = await client.from('campagne').select('id').eq('slug', getRouterParam(event, 'slug') ?? '').maybeSingle()
  if (!campagne) throw createError({ statusCode: 404, statusMessage: 'Campagne introuvable.' })
  await limiter(event, 'inscription')
  const { error } = await client.rpc('sinscrire', { p_campagne_id: campagne.id })
  if (error) throw erreurFonction(error, 'L\'inscription a échoué. Réessaie dans un instant.')
  return { ok: true }
})
