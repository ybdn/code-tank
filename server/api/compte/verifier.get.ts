import { serverSupabaseServiceRole } from '#supabase/server'

// Lien reçu par e-mail : pas de session requise, le jeton signé fait preuve.
export default defineEventHandler(async (event) => {
  const { jeton } = getQuery(event)
  const r = verifierJeton(typeof jeton === 'string' ? jeton : '', useRuntimeConfig(event).secretVerification)
  if (!r.ok) return sendRedirect(event, `/compte?verification=${r.raison}`)
  if (adresseJetable(r.email)) return sendRedirect(event, '/compte?verification=invalide')

  const db = serverSupabaseServiceRole(event)
  // La condition sur email_contact rend le jeton caduc si l'adresse a changé depuis l'envoi.
  // Premier essai : le compte attend sa vérification (le déclencheur peut le mettre en liste d'attente).
  const premier = await db
    .from('compte')
    .update({ email_verifie_le: new Date().toISOString(), etat: 'verifie' })
    .eq('id', r.compteId).eq('email_contact', r.email).eq('etat', 'email_a_verifier')
    .select('id')
  // Sinon, simple nouvelle vérification d'une adresse changée : l'état ne bouge pas.
  const lignes = premier.data?.length
    ? premier.data
    : (await db.from('compte').update({ email_verifie_le: new Date().toISOString() })
        .eq('id', r.compteId).eq('email_contact', r.email).is('email_verifie_le', null).select('id')).data
  // Second clic sur un lien déjà utilisé : l'adresse est vérifiée, on le dit.
  const dejaVerifiee = lignes?.length
    || (await db.from('compte').select('id').eq('id', r.compteId).eq('email_contact', r.email).not('email_verifie_le', 'is', null)).data?.length
  return sendRedirect(event, `/compte?verification=${dejaVerifiee ? 'ok' : 'invalide'}`)
})
