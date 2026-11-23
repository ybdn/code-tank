// Les règles (brief, thème, critères) se figent au premier dépôt : le déclencheur de la base refuse, son message est renvoyé tel quel.
export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const actuel = await campagneDe(event)
  const { campagne, erreurs } = validerCampagne(await corpsObjet(event))
  if (Object.keys(erreurs).length) throw invalide(erreurs)
  // Le slug est l'adresse publique : il ne bouge plus une fois la campagne visible.
  if (campagne.slug !== actuel.slug && actuel.statut !== 'brouillon') throw invalide({ slug: 'Le slug ne se change plus une fois la campagne ouverte.' })
  const { error } = await client.from('campagne').update(campagne).eq('id', actuel.id)
  if (error?.code === '23505') throw invalide({ slug: 'Ce slug est déjà pris.' })
  if (error) throw erreurAdmin(error, 'Modification impossible.')
  return { slug: campagne.slug }
})
