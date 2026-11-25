// Campagnes publiques ouvertes, pour l'accueil : lecture anonyme de la vue campagne_phase, qui masque déjà brouillons,
// invitations, bloquées et expirées.
export default defineEventHandler((event) =>
  lirePublic<{ slug: string; titre: string; theme: string; phase: string; max_participants: number }[]>(event,
    'campagne_phase?select=slug,titre,theme,phase,max_participants&visibilite=eq.publique&statut=eq.ouverte&order=cloture_depot.asc'))
