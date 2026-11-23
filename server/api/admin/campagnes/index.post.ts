export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const { campagne, erreurs } = validerCampagne(await corpsObjet(event))
  if (Object.keys(erreurs).length) throw invalide(erreurs)
  const { error } = await client.from('campagne').insert(campagne)
  if (error?.code === '23505') throw invalide({ slug: 'Ce slug est déjà pris.' })
  if (error) throw erreurAdmin(error, 'Création impossible.')
  return { slug: campagne.slug }
})
