export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  return lu(await client.from('reglage').select('plafond_comptes, plafond_depense_usd').single(), 'des réglages')
})
