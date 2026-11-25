import { serverSupabaseClient } from '#supabase/server'

// Page publique d'une campagne : la vue campagne_phase lue avec la session si elle existe (le Boss voit sa campagne sur
// invitation), sinon en anonyme. Aucune ligne : 404, comme pour toute campagne hors droits. Les critères et poids viennent
// de critere, seule source (AD-8). Avec une session, ce qu'il faut à la page pour ne proposer que l'action que la base
// acceptera (story 2.3) : compte actif, Boss de la campagne (pseudo unique sans tenir compte de la casse), inscrit ; lus
// sous RLS (chacun ne lit que son compte et ses participations).
export default defineEventHandler(async (event) => {
  const slug = slugDeLaRoute(event)
  const client = await serverSupabaseClient(event)
  const { data: { user } } = await client.auth.getUser()
  const colonnes = 'id, slug, titre, theme, brief, langages, visibilite, role_boss, max_participants, places_restantes, ouverture_inscriptions, cloture_depot, date_resultats, statut, phase, boss_pseudo'
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
  const { id, ...publique } = campagne as CampagnePublique & { id: string }
  let moi = { connecte: false, compte_actif: false, est_boss: false, inscrit: false }
  if (user) {
    const [compte, participation] = await Promise.all([
      client.from('compte').select('pseudo, etat').eq('id', user.id).maybeSingle(),
      client.from('participation').select('id').eq('campagne_id', id).eq('etat', 'inscrit').maybeSingle(),
    ])
    if (compte.error || participation.error) erreurCampagne((compte.error ?? participation.error)!, 'Lecture de l\'inscription :', 'La campagne ne peut pas être lue pour le moment.')
    moi = {
      connecte: true,
      compte_actif: compte.data?.etat === 'actif',
      est_boss: compte.data?.pseudo.toLowerCase() === publique.boss_pseudo.toLowerCase(),
      inscrit: !!participation.data,
    }
  }
  return { ...publique, criteres, ...moi } as CampagnePublique & typeof moi & { criteres: Critere[] }
})
