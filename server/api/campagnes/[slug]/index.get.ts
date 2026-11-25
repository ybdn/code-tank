import { serverSupabaseClient } from '#supabase/server'

// Page publique d'une campagne : la vue campagne_phase lue avec la session si elle existe (le Boss voit sa campagne sur
// invitation), sinon en anonyme. Aucune ligne : 404, comme pour toute campagne hors droits. Les critères et poids viennent
// de critere, seule source (AD-8).
export default defineEventHandler(async (event) => {
  const slug = slugDeLaRoute(event)
  const client = await serverSupabaseClient(event)
  const { data: { user } } = await client.auth.getUser()
  const colonnes = 'slug, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats, statut, phase, boss_pseudo'
  const [campagne, criteres] = await Promise.all([
    user
      ? client.from('campagne_phase').select(colonnes).eq('slug', slug).maybeSingle().then(({ data, error }) => {
          if (error) erreurCampagne(error, 'Lecture d\'une campagne publique :', 'La campagne ne peut pas être lue pour le moment.')
          return data
        })
      : lirePublic<CampagnePublique[]>(event, `campagne_phase?select=${colonnes.replaceAll(' ', '')}&slug=eq.${slug}`).then((l) => l[0] ?? null),
    lirePublic<Critere[]>(event, 'critere?select=cle,libelle,jure,poids,calcule&order=jure.asc,poids.desc'),
  ])
  if (!campagne) throw createError({ statusCode: 404, message: 'Campagne introuvable.' })
  return { ...campagne, criteres } as CampagnePublique & { criteres: Critere[] }
})
