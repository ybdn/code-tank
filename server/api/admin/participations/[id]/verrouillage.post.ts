export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const { error } = await client.rpc('verrouiller_vote', { p_participation_id: uuidDe(event, 'id') })
  if (error) throw erreurAdmin(error, 'Verrouillage impossible.')
  return { ok: true }
})
