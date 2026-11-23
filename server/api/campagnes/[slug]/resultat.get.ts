// Entretien et rapport du candidat connecté. Tout passe par sa session : la vue `rapport` ne lui rend que ses audits, publiés,
// sans la réplique masquée ; `mon_depot` que son propre dépôt, `mon_vote_boss` que le commentaire du Boss sur lui. Un autre candidat ou un visiteur ne reçoit rien.
export default defineEventHandler(async (event): Promise<ResultatCandidat> => {
  const { client, user } = await utilisateurVerifie(event)
  setHeader(event, 'cache-control', 'private, no-store')

  const { data: campagne } = await client.from('campagne').select('id,titre,criteres,statut').eq('slug', getRouterParam(event, 'slug') ?? '').maybeSingle()
  const introuvable = createError({ statusCode: 404, statusMessage: 'Aucun résultat pour toi dans cette campagne.' })
  if (!campagne || !STATUTS_RESULTATS.includes(campagne.statut)) throw introuvable

  const [rapport, compte, participation] = await Promise.all([
    client.from('rapport').select('jure,resultat').eq('campagne_id', campagne.id),
    client.from('compte').select('pseudo').eq('id', user.id).maybeSingle(),
    client.from('participation').select('id').eq('campagne_id', campagne.id).eq('compte_id', user.id).maybeSingle(),
  ])
  if (rapport.error || !rapport.data?.length) throw introuvable

  const [classement, depot, vote] = await Promise.all([
    compte.data
      ? client.from('classement').select('pseudo,rang,score_claude,note_boss,score_final,notes,disqualifie,justification,justification_departage')
        .eq('campagne_id', campagne.id).eq('pseudo', compte.data.pseudo).maybeSingle()
      : { data: null },
    participation.data ? client.from('mon_depot').select('demande').eq('participation_id', participation.data.id).maybeSingle() : { data: null },
    client.from('mon_vote_boss').select('commentaire').eq('campagne_id', campagne.id).maybeSingle(),
  ])

  return {
    titre: campagne.titre,
    criteres: campagne.criteres as Critere[],
    ligne: (classement.data as LigneClassement | null) ?? null,
    demande: depot.data?.demande?.trim() || null,
    commentaire_boss: vote.data?.commentaire?.trim() || null,
    // Ordre de l'entretien, pas celui de la base.
    jures: JURES_CLAUDE.flatMap(({ jure }) => rapport.data.filter((a) => a.jure === jure).map((a) => ({ jure, sortie: lireSortie(a.resultat) }))),
  }
})
