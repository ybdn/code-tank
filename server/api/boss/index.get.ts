// État du compte connecté et ses campagnes, la plus récente d'abord, lus sous son JWT (RLS : sa ligne de compte, boss_id = auth.uid()).
// L'état dit à la page si elle propose la création (compte actif seulement).
export default defineEventHandler(async (event) => {
  const { client } = await utilisateurVerifie(event)
  const [compte, campagnes] = await Promise.all([
    client.from('compte').select('etat').maybeSingle(),
    client.from('campagne').select('slug, titre, statut, date_resultats, bloquee_le, cree_le').order('cree_le', { ascending: false }),
  ])
  const error = compte.error ?? campagnes.error
  if (error) erreurCampagne(error, 'Lecture des campagnes :', 'Tes campagnes ne peuvent pas être lues pour le moment.')
  return { etat: compte.data?.etat ?? null, campagnes: campagnes.data }
})
