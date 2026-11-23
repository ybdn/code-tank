export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const { reglages, erreurs } = validerReglages(await corpsObjet(event))
  if (Object.keys(erreurs).length) throw invalide(erreurs)
  // Ligne unique : le filtre « jamais nul » existe parce que PostgREST refuse un UPDATE sans WHERE.
  const { data, error } = await client.from('reglage').update(reglages).not('plafond_depense_usd', 'is', null).select('plafond_comptes')
  if (error) throw erreurAdmin(error, 'Enregistrement impossible.')
  if (data.length !== 1) throw createError({ statusCode: 500, statusMessage: 'Les réglages n\'ont pas pu être enregistrés.' })
  return { ok: true }
})
