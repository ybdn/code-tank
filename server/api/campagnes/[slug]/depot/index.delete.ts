import { serverSupabaseServiceRole } from '#supabase/server'

// Retrait du dépôt (story 3.3) : retirer_depot, avec le JWT de l'appelant, revérifie tout, supprime la ligne et rend les
// chemins de effacer_archives (AD-11), que la route efface du bucket avec la clé de service. La ligne est déjà partie : un
// échec d'effacement est journalisé (code seulement), pas montré au candidat.
// shortcut: un objet dont l'effacement échoue reste dans le bucket ; objets_abandonnes (AD-11, epic 6) le nettoiera.
export default defineEventHandler(async (event) => {
  const { client, id } = await campagneDeLInscrit(event)
  const { data: chemins, error } = await client.rpc('retirer_depot', { p_campagne: id })
  if (error) erreurCampagne(error, 'Retrait d\'un dépôt :', 'Le retrait a échoué. Réessaie dans un instant.')
  const { error: erreurStockage } = await serverSupabaseServiceRole(event).storage.from('depots').remove(chemins ?? [])
  if (erreurStockage) console.error('Effacement des archives : échec du stockage.')
  return { ok: true }
})
