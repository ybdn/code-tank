import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

// Constat d'une campagne prete (écran du Boss ou cron) : reserver_envoi pose la marque, et seul l'appelant qui l'obtient
// envoie ; deux constats simultanés n'envoient qu'un e-mail. Jamais bloquant : tout échec est journalisé par un code fixe, sans
// l'adresse ni le message SMTP (qui peut la citer). L'adresse est lue avec le rôle de service et ne sort pas d'ici.
// shortcut: la marque est posée avant l'envoi (AD-12 : un e-mail perdu plutôt qu'un doublon) ; un envoi en échec n'est pas
// rejoué. À revoir si une file d'envoi avec reprise arrive.
export async function prevenirFin(event: H3Event, campagneId: string): Promise<boolean> {
  const admin = serverSupabaseServiceRole(event)
  const { data, error } = await admin.rpc('reserver_envoi', { p_campagne: campagneId })
  if (error) {
    console.error('E-mail de fin de délibération : réservation en échec,', error.code)
    return false
  }
  if (!data) return false
  const { slug, titre, boss_id } = data as { slug: string; titre: string; boss_id: string }
  const { data: lu, error: erreurAdresse } = await admin.auth.admin.getUserById(boss_id)
  if (erreurAdresse || !lu.user?.email) {
    console.error('E-mail de fin de délibération : adresse du Boss illisible, e-mail perdu.')
    return false
  }
  const config = useRuntimeConfig(event)
  const { sujet, texte } = courrielFin(config.siteUrl, slug, titre)
  try {
    await envoyerCourriel(config, lu.user.email, sujet, texte)
    return true
  } catch (e) {
    // Le code de nodemailer (EAUTH, ECONNECTION…) seulement : le message peut citer l'adresse.
    const code = (e as { code?: unknown }).code
    console.error('E-mail de fin de délibération : envoi en échec, e-mail perdu,', typeof code === 'string' ? code : 'sans code')
    return false
  }
}
