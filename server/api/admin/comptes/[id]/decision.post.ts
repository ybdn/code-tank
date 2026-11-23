// Autoriser, refuser ou mettre en liste d'attente : decider_compte refuse les transitions interdites.
const ETATS = ['autorise', 'refuse', 'liste_attente'] as const

const AVIS = {
  autorise: { sujet: 'Code Tank : ton compte est autorisé', texte: 'L\'organisateur a autorisé ton compte. Tu peux maintenant t\'inscrire à une campagne ouverte :' },
  liste_attente: {
    sujet: 'Code Tank : ta candidature est sur la liste d\'attente',
    texte: 'Le nombre de comptes autorisés est atteint : ta candidature est sur la liste d\'attente. L\'organisateur choisit qui monte, ce n\'est pas l\'ordre d\'arrivée. Tu peux suivre l\'état de ton compte ici :',
  },
  refuse: { sujet: 'Code Tank : ta candidature', texte: 'Ta candidature n\'a pas été retenue. Pour exercer tes droits sur tes données, écris à support@ybdn.io. Ton compte :' },
}

export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const id = uuidDe(event, 'id')
  const { etat } = await corpsObjet(event)
  if (!ETATS.includes(etat as (typeof ETATS)[number])) throw createError({ statusCode: 422, statusMessage: 'Décision inconnue.' })
  const { error } = await client.rpc('decider_compte', { p_compte_id: id, p_etat: etat as (typeof ETATS)[number] })
  if (error) throw erreurAdmin(error, 'Décision impossible.')

  // E-mail de décision : lu avec la session de l'organisateur, jamais bloquant ; la réponse dit s'il est parti.
  const { data: compte } = await client.from('compte').select('email_contact, email_verifie_le').eq('id', id).maybeSingle()
  if (!compte?.email_verifie_le || !adresseUtilisable(compte.email_contact)) return { ok: true, courriel: 'non_verifiee' as const }
  const avis = AVIS[etat as (typeof ETATS)[number]]
  try {
    await envoyerAvis(useRuntimeConfig(event), compte.email_contact, avis.sujet, avis.texte)
    return { ok: true, courriel: 'envoye' as const }
  } catch (e) {
    console.error('Envoi de la décision :', (e as { code?: string }).code ?? 'erreur') // jamais l'adresse
    return { ok: true, courriel: 'echec' as const }
  }
})
