// Campagnes publiques où l'on peut encore entrer, pour l'accueil : lecture anonyme de la vue campagne_phase, qui masque déjà
// brouillons, invitations, bloquées et expirées. Clôture des dépôts la plus proche d'abord.
// shortcut: pas de pagination, 50 campagnes au plus ; à revoir quand l'accueil en compte davantage.
export default defineEventHandler((event) =>
  lirePublic<{ slug: string; titre: string; theme: string; phase: string; max_participants: number }[]>(event,
    'campagne_phase?select=slug,titre,theme,phase,max_participants&visibilite=eq.publique&statut=eq.ouverte&phase=neq.depots_clos&order=cloture_depot.asc&limit=50'))
