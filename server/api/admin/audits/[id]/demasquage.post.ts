export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const { error } = await client.rpc('demasquer_replique', { p_audit_id: uuidDe(event, 'id') })
  if (error) throw erreurAdmin(error, 'Démasquage impossible.')
  return { ok: true }
})
