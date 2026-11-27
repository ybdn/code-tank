import { serverSupabaseServiceRole } from '#supabase/server'

// Fin voulue de la délibération (story 4.6, AD-5) : le Boss de la campagne (404 sinon) la termine quand elle est en délibération
// sans clé. Ordre : Boss, JSON (415), puis terminer_deliberation avec la clé de service et l'id vérifié du Boss (jamais
// authenticated : PostgREST l'exposerait). Refus de la base (clé encore rangée, étape, compte, blocage) : 409. Un dépôt dont un
// audit est en échec n'aura pas de score. Pas de limite de débit : une seule fois par campagne.
export default defineEventHandler(async (event) => {
  const { campagne, user } = await campagneDuBoss(event)
  exigerJson(event)
  const { error } = await serverSupabaseServiceRole(event).rpc('terminer_deliberation', { p_compte: user.id, p_campagne: campagne.id })
  if (error) erreurCampagne(error, 'Fin de la délibération :', 'La délibération ne peut pas être terminée pour le moment. Réessaie dans un instant.')
  return { statut: 'prete' as const }
})
