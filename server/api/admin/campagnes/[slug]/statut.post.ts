import { ETAPES } from '../../../../../shared/utils/admin'

// Étape suivante : changer_statut_campagne et son déclencheur refusent l'ordre, les poids ≠ 100 et la publication sans vote verrouillé.
export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const { statut } = await corpsObjet(event)
  if (!(ETAPES as readonly unknown[]).includes(statut)) throw createError({ statusCode: 422, statusMessage: 'Statut inconnu.' })
  const campagne = await campagneDe(event)
  const { error } = await client.rpc('changer_statut_campagne', { p_campagne_id: campagne.id, p_statut: statut as Etape })
  if (error) throw erreurAdmin(error, 'Changement de statut impossible.')
  return { ok: true }
})
