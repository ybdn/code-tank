// Page /admin et API /api/admin : réservées à l'organisateur, vérifié ici pour toute route à ce chemin, présente ou à venir.
export default defineEventHandler(async (event) => {
  if (!cheminAdmin(event.path)) return
  event.context.admin = await verifierOrganisateur(event)
  setResponseHeader(event, 'x-robots-tag', 'noindex, nofollow')
})
