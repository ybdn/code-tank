// Classement final : la vue `classement` ne montre que les campagnes publiées ou archivées, lisible de tous.
const COLONNES = 'pseudo,rang,score_claude,note_boss,score_final,notes,disqualifie,justification,justification_departage'

export default defineEventHandler(async (event) => {
  const slug = encodeURIComponent(getRouterParam(event, 'slug') ?? '')
  const [campagne] = await lirePublic<{ id: string }[]>(event, `campagne?select=id&slug=eq.${slug}&limit=1`)
  if (!campagne) throw createError({ statusCode: 404, statusMessage: 'Campagne introuvable.' })
  return lirePublic<LigneClassement[]>(event, `classement?select=${COLONNES}&campagne_id=eq.${campagne.id}&order=rang.asc.nullslast,pseudo.asc`)
})
