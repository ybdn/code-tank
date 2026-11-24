// Chiffres du tableau de bord : comptes par état, plafonds, et pour chaque campagne active (des inscriptions à prête)
// l'avancement des participations ; les brouillons à part, pour la seule tâche « date d'ouverture passée ». Rien que des comptes : du vote du Boss, seulement s'il est
// verrouillé, jamais sa note ni son commentaire (vote à l'aveugle).
const EN_COURS = ['inscriptions', 'depot', 'deliberation', 'prete'] as const

// Une relation un-à-un embarquée arrive en objet ou en tableau selon la version de PostgREST.
const un = <T>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x)

export default defineEventHandler(async (event): Promise<TableauDeBord> => {
  const { client } = contexteAdmin(event)
  const [comptes, reglage, campagnes] = await Promise.all([
    client.from('compte').select('etat').eq('role', 'candidat'),
    client.from('reglage').select('plafond_comptes, plafond_depense_usd').single(),
    client.from('campagne')
      .select('id, slug, titre, statut, ouverture_inscriptions, cloture_depot, date_resultats, max_participants')
      .in('statut', ['brouillon', ...EN_COURS]).order('ouverture_inscriptions'),
  ])
  const toutes = lu(campagnes, 'des campagnes')
  const lc = toutes.filter((c) => c.statut !== 'brouillon')
  // Une seule lecture, filtrée par campagne : pas de liste d'identifiants de participations dans l'URL.
  const participations = lu(await client.from('participation')
    .select('campagne_id, reception(etat), depot(id), vote_boss(verrouille_le)')
    .in('campagne_id', lc.map((c) => c.id)).eq('etat', 'inscrit'), 'des participations')

  const parEtat: Record<string, number> = {}
  for (const c of lu(comptes, 'des comptes')) parEtat[c.etat] = (parEtat[c.etat] ?? 0) + 1
  const r = lu(reglage, 'du réglage')

  return {
    comptes: parEtat,
    plafond_comptes: r.plafond_comptes,
    plafond_depense_usd: r.plafond_depense_usd,
    brouillons: toutes.filter((c) => c.statut === 'brouillon').map(({ slug, titre, ouverture_inscriptions }) => ({ slug, titre, ouverture_inscriptions })),
    campagnes: lc.map((c) => {
      const ps = participations.filter((p) => p.campagne_id === c.id)
      const etat = (p: (typeof ps)[number]) => un(p.reception)?.etat
      return {
        ...c,
        inscrits: ps.length,
        receptions_en_attente: ps.filter((p) => etat(p) === 'en_attente').length,
        receptions_refusees: ps.filter((p) => etat(p) === 'refusee').length,
        depots: ps.filter((p) => un(p.depot)).length,
        votes_verrouilles: ps.filter((p) => un(p.vote_boss)?.verrouille_le).length,
      }
    }),
  }
})
