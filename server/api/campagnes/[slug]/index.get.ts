import { serverSupabaseClient } from '#supabase/server'

// Page publique d'une campagne : la vue campagne_phase lue avec la session si elle existe (le Boss voit sa campagne sur
// invitation, un inscrit aussi), sinon en anonyme. Le reste (404, critères, état de l'appelant) : pageCampagne ; `?exclus=1`
// (page de dépôt) y ajoute la liste des fichiers exclus du dépôt.
export default defineEventHandler(async (event) => {
  const slug = slugDeLaRoute(event)
  const client = await serverSupabaseClient(event)
  const { data: { user } } = await client.auth.getUser()
  const colonnes = 'id, slug, titre, theme, brief, langages, visibilite, role_boss, max_participants, places_restantes, ouverture_inscriptions, cloture_depot, date_resultats, statut, phase, boss_pseudo'
  return pageCampagne(event, client, user?.id, user
    ? client.from('campagne_phase').select(colonnes).eq('slug', slug).maybeSingle().then(({ data, error }) => {
        if (error) erreurCampagne(error, 'Lecture d\'une campagne publique :', 'La campagne ne peut pas être lue pour le moment.')
        return data as CampagnePublique & { id: string } | null
      })
    : lirePublic<(CampagnePublique & { id: string })[]>(event, `campagne_phase?select=${colonnes.replaceAll(' ', '')}&slug=eq.${slug}`).then((l) => l[0] ?? null), getQuery(event).exclus === '1')
})
