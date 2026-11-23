// La campagne et, par participation inscrite : réception, dépôt accepté, vote du Boss, puis (vote verrouillé seulement)
// audits, case de réutilisation et note d'outillage. Vote à l'aveugle : la base cache déjà ces trois lectures tant que le vote
// n'est pas verrouillé ; on ne les assemble pas non plus avant.
export default defineEventHandler(async (event): Promise<DetailCampagne> => {
  const { client } = contexteAdmin(event)
  const campagne = await campagneDe(event)

  const participations = lu(await client.from('participation')
    .select('id, compte_id, inscrit_le, compte:compte_id(pseudo, vrai_nom)')
    .eq('campagne_id', campagne.id).eq('etat', 'inscrit').order('inscrit_le'), 'des participations')
  const ids = participations.map((p) => p.id)

  const [receptions, depots, votes, decisions, candidats] = await Promise.all([
    client.from('reception')
      .select('participation_id, etat, motifs_refus, recue_le, traitee_le, presentation, demande, type_code, outils_ia').in('participation_id', ids),
    client.from('depot')
      .select('id, participation_id, chemin_stockage, sha256, taille_octets, nb_fichiers, fichiers_exclus, nb_tokens, presentation, demande, type_code, licence_presente, outils_ia, traces_ia, alerte_manipulation, alertes_integrite, depose_le')
      .in('participation_id', ids),
    client.from('vote_boss').select('participation_id, note, commentaire, verrouille_le').in('participation_id', ids),
    client.from('decision').select('id, participation_id, type, justification, prise_le').eq('campagne_id', campagne.id).order('prise_le'),
    client.from('compte').select('id, pseudo, vrai_nom').eq('role', 'candidat').eq('etat', 'autorise').order('pseudo'),
  ])
  const dr = lu(receptions, 'des réceptions')
  const dd = lu(depots, 'des dépôts')
  const dv = lu(votes, 'des votes')
  const dx = lu(decisions, 'des décisions')

  const verrouilles = dv.filter((v) => v.verrouille_le).map((v) => v.participation_id)
  const idsDepotsVerrouilles = dd.filter((d) => verrouilles.includes(d.participation_id)).map((d) => d.id)
  const [audits, contacts, outillage] = idsDepotsVerrouilles.length
    ? await Promise.all([
        client.from('audit').select('id, depot_id, jure, modele, version_consignes, statut, resultat, replique_masquee, cout_usd, tentatives').in('depot_id', idsDepotsVerrouilles).order('jure'),
        client.from('contact_reutilisation_lisible').select('participation_id, contact_reutilisation').in('participation_id', verrouilles),
        client.from('depot').select('id, note_outillage').in('id', idsDepotsVerrouilles),
      ])
    : [null, null, null]

  return {
    campagne: campagne as unknown as CampagneAdmin,
    participations: participations.map((p) => {
      const d = dd.find((x) => x.participation_id === p.id)
      const v = dv.find((x) => x.participation_id === p.id)
      const r = dr.find((x) => x.participation_id === p.id)
      const verrouille = Boolean(v?.verrouille_le) && Boolean(d)
      return {
        id: p.id,
        compte_id: p.compte_id,
        pseudo: p.compte?.pseudo ?? 'candidat supprimé',
        vrai_nom: p.compte?.vrai_nom ?? '',
        inscrit_le: p.inscrit_le,
        reception: r ? (r as unknown as ReceptionAdmin) : null,
        depot: d ? ({ ...d, chemin_stockage: undefined, archive: Boolean(d.chemin_stockage) } as unknown as DepotAdmin) : null,
        vote: v ? { note: v.note, commentaire: v.commentaire, verrouille_le: v.verrouille_le } : null,
        apres: verrouille && d && audits && contacts && outillage
          ? {
              audits: lu(audits, 'des audits').filter((a) => a.depot_id === d.id) as unknown as AuditAdmin[],
              contact_reutilisation: lu(contacts, 'de la case de réutilisation').find((c) => c.participation_id === p.id)?.contact_reutilisation ?? null,
              note_outillage: lu(outillage, 'de la note d\'outillage').find((x) => x.id === d.id)?.note_outillage ?? null,
            }
          : null,
        decisions: dx.filter((x) => x.participation_id === p.id),
      }
    }),
    candidats: lu(candidats, 'des candidats'),
  }
})
