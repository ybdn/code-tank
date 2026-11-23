// Campagnes lisibles de tous (la RLS cache les brouillons).
export default defineEventHandler((event) =>
  lirePublic<CampagneListee[]>(event, 'campagne?select=slug,titre,theme,statut,cloture_depot&order=ouverture_inscriptions.desc'))
