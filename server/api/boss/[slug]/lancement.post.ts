import { serverSupabaseServiceRole } from '#supabase/server'

// Lancement de la délibération avec la clé du Boss (story 4.3, AD-4, AD-5, SPECS § 6 et § 9). Ordre : Boss (404), JSON (415),
// limite de débit (429, le site n'est pas un testeur de clés), corps (400), forme de la clé, count_tokens (400 refusée, 502
// impossible : aucun lancement consommé), puis lancer_deliberation (rôle de service, avec l'id vérifié du Boss) qui refuse en 409
// avant toute écriture de la clé. La clé n'est ni journalisée, ni renvoyée, ni citée par une erreur : seuls des codes et des
// messages fixes sortent. Réponse : les 4 derniers caractères et le nombre de lancements.
export default defineEventHandler(async (event) => {
  const { campagne, user } = await campagneDuBoss(event)
  exigerJson(event)
  await limiter(event, 'lancement')
  const c = await readBody(event).catch(() => null) as Record<string, unknown> | null
  const corps = c && typeof c === 'object' ? c : {}
  const plafond = corps.plafond_usd
  if (typeof plafond !== 'number' || !(plafond >= 0.01 && plafond <= PLAFOND_MAX_USD)) {
    throw createError({ statusCode: 400, message: 'Le plafond est un montant en dollars, de 0,01 à 10 000.' })
  }
  if (!Array.isArray(corps.engagements) || corps.engagements.length !== ENGAGEMENTS.length || !corps.engagements.every((v) => v === true)) {
    throw createError({ statusCode: 400, message: 'Coche les trois engagements pour lancer la délibération.' })
  }
  if (corps.version !== ENGAGEMENTS_VERSION) throw createError({ statusCode: 409, message: 'Le texte des engagements a changé : recharge la page.' })
  const cle = corps.cle
  if (!formeCleValide(cle)) throw createError({ statusCode: 400, message: MESSAGE_CLE_REFUSEE })
  const verdict = await verifierCle(event, cle)
  if (verdict === 'refusee') throw createError({ statusCode: 400, message: MESSAGE_CLE_REFUSEE })
  if (verdict === 'indisponible') throw createError({ statusCode: 502, message: 'La clé n\'a pas pu être vérifiée pour le moment. Réessaie dans un instant.' })
  const { data, error } = await serverSupabaseServiceRole(event).rpc('lancer_deliberation', {
    p_compte: user.id, p_campagne: campagne.id, p_cle: cle, p_plafond_usd: plafond, p_version_engagements: ENGAGEMENTS_VERSION,
  })
  if (error) erreurCampagne(error, 'Lancement de la délibération :', 'La délibération ne peut pas être lancée pour le moment. Réessaie dans un instant.')
  event.waitUntil(appelerJury(event, 'lancement'))
  const { cle_fin, lancements } = data as { cle_fin: string; lancements: number }
  return { cle_fin, lancements }
})
