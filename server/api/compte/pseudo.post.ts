// Changement de pseudo d'un compte en liste d'attente (story 1.3) par changer_pseudo, avec le JWT de la personne : la
// fonction lit l'appelant dans le jeton et refuse tout compte qui n'est pas en_attente (pseudo figé une fois actif).
// shortcut: pas de limite par IP ni par compte (RPC appelable par PostgREST), à revoir avec la story 7.2 si la liste d'attente s'ouvre au public
export default defineEventHandler(async (event) => {
  exigerJson(event)
  const { client } = await utilisateurVerifie(event)
  const corps = await readBody(event).catch(() => null)
  const { error } = await client.rpc('changer_pseudo', { p_pseudo: typeof corps?.pseudo === 'string' ? corps.pseudo.trim() : '' })
  if (error) {
    // P0001 : règle métier, message fixe écrit par la fonction, jamais une valeur reçue.
    if (error.code === 'P0001') throw createError({ statusCode: 409, message: error.message })
    console.error('Changement de pseudo :', error.code)
    throw createError({ statusCode: 500, message: 'Ton pseudo ne peut pas être changé pour le moment. Réessaie dans un instant.' })
  }
  return { ok: true }
})
