// Chiffres du tableau de bord : comptes par état, plafonds, et pour chaque campagne non archivée l'avancement des
// participations. Rien que des comptes : pas une note ni un commentaire du Boss (vote à l'aveugle), seulement s'il est verrouillé.
export default defineEventHandler(async (event): Promise<TableauDeBord> => {
  const { client } = contexteAdmin(event)
  const [comptes, reglage, campagnes] = await Promise.all([
    client.from('compte').select('etat').eq('role', 'candidat'),
    client.from('reglage').select('plafond_comptes, plafond_depense_usd').single(),
    client.from('campagne')
      .select('id, slug, titre, statut, ouverture_inscriptions, cloture_depot, date_resultats, max_participants')
      .neq('statut', 'archivee').order('ouverture_inscriptions'),
  ])
  const lc = lu(campagnes, 'des campagnes')
  const participations = lu(await client.from('participation').select('id, campagne_id')
    .in('campagne_id', lc.map((c) => c.id)).eq('etat', 'inscrit'), 'des participations')
  const ids = participations.map((p) => p.id)
  const [receptions, depots, votes] = await Promise.all([
    client.from('reception').select('participation_id, etat').in('participation_id', ids),
    client.from('depot').select('participation_id').in('participation_id', ids),
    client.from('vote_boss').select('participation_id, verrouille_le').in('participation_id', ids),
  ])
  const lr = lu(receptions, 'des réceptions')
  const ld = new Set(lu(depots, 'des dépôts').map((d) => d.participation_id))
  const lv = new Set(lu(votes, 'des votes').filter((v) => v.verrouille_le).map((v) => v.participation_id))

  const parEtat: Record<string, number> = {}
  for (const c of lu(comptes, 'des comptes')) parEtat[c.etat] = (parEtat[c.etat] ?? 0) + 1
  const r = lu(reglage, 'du réglage')

  return {
    comptes: parEtat,
    plafond_comptes: r.plafond_comptes,
    plafond_depense_usd: r.plafond_depense_usd,
    campagnes: lc.map((c) => {
      const pids = participations.filter((p) => p.campagne_id === c.id).map((p) => p.id)
      const rc = lr.filter((x) => pids.includes(x.participation_id))
      return {
        ...c,
        inscrits: pids.length,
        receptions_en_attente: rc.filter((x) => x.etat === 'en_attente').length,
        receptions_refusees: rc.filter((x) => x.etat === 'refusee').length,
        depots: pids.filter((id) => ld.has(id)).length,
        votes_verrouilles: pids.filter((id) => lv.has(id)).length,
      }
    }),
  }
})
