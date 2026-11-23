// Toutes les campagnes, brouillons compris (la RLS le permet à l'organisateur seul).
export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  return lu(await client.from('campagne')
    .select('id, slug, titre, statut, ouverture_inscriptions, cloture_depot, date_resultats, max_participants')
    .order('ouverture_inscriptions', { ascending: false }), 'des campagnes')
})
