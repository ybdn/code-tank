import { ETAPES } from '../../../../../shared/utils/admin'

// Étape suivante : changer_statut_campagne et son déclencheur refusent l'ordre, les poids ≠ 100 et la publication sans vote verrouillé.
// À la publication, un e-mail part à chaque participant avec dépôt et adresse vérifiée (SPECS § 3). Il ne bloque ni n'annule rien.
export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const { statut } = await corpsObjet(event)
  if (!(ETAPES as readonly unknown[]).includes(statut)) throw createError({ statusCode: 422, statusMessage: 'Statut inconnu.' })
  const campagne = await campagneDe(event)
  const { error } = await client.rpc('changer_statut_campagne', { p_campagne_id: campagne.id, p_statut: statut as Etape })
  if (error) throw erreurAdmin(error, 'Changement de statut impossible.')
  if (statut !== 'publiee') return { ok: true }

  // Adresses lues avec la session de l'organisateur (la RLS le lui permet), jamais avec la clé de service.
  const { data, error: erreurLecture } = await client
    .from('participation')
    .select('compte:compte(email_contact, email_verifie_le), depot!inner(id)')
    .eq('campagne_id', campagne.id)
    .eq('etat', 'inscrit')
  if (erreurLecture || !data) {
    console.error('Lecture des destinataires :', erreurLecture?.message)
    return { ok: true, courriels: null }
  }
  const adresses = data.flatMap((p) => (p.compte?.email_verifie_le && adresseUtilisable(p.compte.email_contact) ? [p.compte.email_contact] : []))
  const { envoyes, echecs } = await envoyerResultats(useRuntimeConfig(event), campagne, adresses)
  return { ok: true, courriels: { envoyes, echecs, sansAdresseVerifiee: data.length - adresses.length } }
})
