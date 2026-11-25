// Campagnes du Boss connecté, la plus récente d'abord, lues sous son JWT (RLS : boss_id = auth.uid()).
export default defineEventHandler(async (event) => {
  const { client } = await utilisateurVerifie(event)
  const { data, error } = await client.from('campagne').select('slug, titre, statut, cree_le').order('cree_le', { ascending: false })
  if (error) erreurCampagne(error, 'Lecture des campagnes :', 'Tes campagnes ne peuvent pas être lues pour le moment.')
  return { campagnes: data }
})
