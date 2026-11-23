// Masquer une réplique (jamais une note). demasquage.post.ts fait l'inverse.
export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const { error } = await client.rpc('masquer_replique', { p_audit_id: uuidDe(event, 'id') })
  if (error) throw erreurAdmin(error, 'Masquage impossible.')
  return { ok: true }
})
