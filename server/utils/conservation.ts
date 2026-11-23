import { timingSafeEqual, createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { SECRET_MIN } from './jeton'

// Durées et bornes de la conservation (SPECS § 9), à un seul endroit.
// À CONFIRMER PAR LE PORTEUR : attenteReponseJours et avertissementJours, que la spec ne fixe pas.
export const DELAIS = {
  debitHeures: 24,
  envoiAbandonneHeures: 24,
  archivageJours: 30, // après la publication
  refusJours: 30, // après la décision
  attenteMois: 12, // entre deux confirmations de la liste d'attente
  attenteReponseJours: 30, // pour répondre à la demande de confirmation
  inactiviteMois: 24,
  avertissementJours: 30, // entre l'e-mail d'inactivité et la suppression
}
// Par exécution : le reste passe au suivant.
export const BORNES = { debit: 10_000, objets: 500, comptes: 50 }

const JOUR = 86_400_000
const avant = (jours: number) => new Date(Date.now() - jours * JOUR).toISOString()
const avantMois = (mois: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() - mois)
  return d.toISOString()
}

// Secret du planificateur (CRON_SECRET, le nom que l'hébergeur envoie), comparé en temps constant. Sinon : 404.
export function verifierCron(event: H3Event) {
  const secret = process.env.CRON_SECRET ?? ''
  const recu = getRequestHeader(event, 'authorization') ?? ''
  const h = (v: string) => createHash('sha256').update(v).digest()
  if (secret.length < SECRET_MIN || !timingSafeEqual(h(recu), h(`Bearer ${secret}`))) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
}

// Lecture d'une réponse de la base : une erreur remonte avec son seul code (jamais le message, qui peut citer une donnée).
const lu = <T>(r: { data: T | null; error: object | null }): T => {
  if (r.error) throw Object.assign(new Error('base'), { code: (r.error as { code?: string }).code ?? 'base' })
  return r.data as T
}

const AVIS_ATTENTE = {
  sujet: 'Code Tank : attends-tu toujours une place ?',
  texte: `Ta candidature est sur la liste d'attente de Code Tank depuis plus d'un an. Pour la garder, confirme que tu attends toujours en ouvrant ton compte, puis en cliquant sur « Je suis toujours en attente » : sans réponse sous ${DELAIS.attenteReponseJours} jours, elle sera effacée.`,
}
const AVIS_INACTIVITE = {
  sujet: 'Code Tank : ton compte sera supprimé',
  texte: `Tu ne t'es pas connecté à Code Tank depuis plus de ${DELAIS.inactiviteMois} mois. Sans connexion de ta part sous ${DELAIS.avertissementJours} jours, ton compte sera supprimé avec tes résultats ; si une campagne est publiée, sa ligne du classement restera sous « candidat supprimé ». Pour le garder, ouvre simplement ton compte :`,
}

type Compte = { id: string; email_contact: string }

export async function conserver(event: H3Event) {
  const db = serverSupabaseServiceRole(event)
  const stockage = db.storage.from('depots')
  const config = useRuntimeConfig(event)

  // Supprime des comptes un par un ; un échec compte et n'arrête pas les autres.
  async function supprimer(comptes: { id: string }[]) {
    let supprimes = 0
    let echecs = 0
    for (const c of comptes) {
      try {
        await supprimerCompte(event, c.id)
        supprimes++
      } catch {
        echecs++
      }
    }
    return { supprimes, echecs }
  }
  // Envoie un avis à chacun, puis le marque ; sans envoi réussi, pas de marque. Une panne du SMTP arrête la boucle.
  async function prevenir(comptes: Compte[], avis: { sujet: string; texte: string }, marquer: (id: string) => PromiseLike<unknown>) {
    let envoyes = 0
    let echecs = 0
    for (const c of comptes) {
      try {
        await envoyerAvis(config, c.email_contact, avis.sujet, avis.texte)
        await marquer(c.id)
        envoyes++
      } catch (e) {
        echecs++
        if (estPanneSmtp(e)) break
      }
    }
    return { envoyes, echecs }
  }

  const taches: Record<string, () => Promise<Record<string, number>>> = {
    // a. Compteur de la limite de débit.
    debit: async () => ({ supprimes: lu(await db.rpc('purger_debit', { p_limite: BORNES.debit, p_age_h: DELAIS.debitHeures })) }),

    // b. Envois jamais confirmés.
    envois: async () => {
      const noms = lu(await db.rpc('objets_abandonnes', { p_limite: BORNES.objets, p_age_h: DELAIS.envoiAbandonneHeures }))
      if (!noms.length) return { supprimes: 0 }
      return { supprimes: lu(await stockage.remove(noms)).length }
    },

    // c. Archives 30 jours après la publication, puis archivage de la campagne. Une campagne dont les archives dépassent
    // le reste de la borne n'est pas archivée : elle finit au passage suivant.
    archives: async () => {
      const campagnes = lu(await db.from('campagne').select('id').eq('statut', 'publiee').lt('publiee_le', avant(DELAIS.archivageJours)).order('publiee_le'))
      let reste = BORNES.objets
      let objets = 0
      let archivees = 0
      for (const c of campagnes) {
        const ids = lu(await db.from('participation').select('id').eq('campagne_id', c.id)).map((p) => p.id)
        let complet = true
        for (const id of ids) {
          if (reste <= 0) {
            complet = false
            break
          }
          const dossier = `${c.id}/${id}`
          const presents = lu(await stockage.list(dossier, { limit: reste + 1 }))
          const cibles = presents.slice(0, reste).map((o) => `${dossier}/${o.name}`)
          if (cibles.length) {
            lu(await stockage.remove(cibles))
            reste -= cibles.length
            objets += cibles.length
          }
          if (presents.length > cibles.length) {
            complet = false
            break
          }
        }
        if (!complet) break
        if (ids.length) {
          lu(await db.from('depot').update({ chemin_stockage: null }).in('participation_id', ids))
          lu(await db.from('reception').delete().in('participation_id', ids))
        }
        lu(await db.from('campagne').update({ statut: 'archivee' }).eq('id', c.id))
        archivees++
      }
      return { campagnes: archivees, objets }
    },

    // d. Candidature refusée depuis 30 jours.
    refuses: async () =>
      supprimer(lu(await db.from('compte').select('id').eq('role', 'candidat').eq('etat', 'refuse').lt('etat_le', avant(DELAIS.refusJours)).limit(BORNES.comptes))),

    // e. Liste d'attente : demande de confirmation tous les 12 mois, effacement sans réponse.
    attente: async () => {
      const limite = avantMois(DELAIS.attenteMois)
      const aRelancer = lu(await db.from('compte').select('id, email_contact').eq('role', 'candidat').eq('etat', 'liste_attente')
        .is('attente_demandee_le', null).lt('etat_le', limite).or(`confirme_attente_le.is.null,confirme_attente_le.lt.${limite}`).limit(BORNES.comptes))
      const relance = await prevenir(aRelancer, AVIS_ATTENTE, (id) =>
        db.from('compte').update({ attente_demandee_le: new Date().toISOString() }).eq('id', id).is('attente_demandee_le', null))
      const sansReponse = lu(await db.from('compte').select('id').eq('role', 'candidat').eq('etat', 'liste_attente')
        .lt('attente_demandee_le', avant(DELAIS.attenteReponseJours)).limit(BORNES.comptes))
      const efface = await supprimer(sansReponse)
      return { demandes: relance.envoyes, echecs_envoi: relance.echecs, supprimes: efface.supprimes, echecs_suppression: efface.echecs }
    },

    // f. Inactivité : avertissement après 24 mois, suppression 30 jours plus tard sans connexion.
    inactivite: async () => {
      const limite = avantMois(DELAIS.inactiviteMois)
      const aPrevenir = lu(await db.from('compte').select('id, email_contact').eq('role', 'candidat').lt('derniere_connexion_le', limite)
        .is('prevenu_inactivite_le', null).not('email_verifie_le', 'is', null).limit(BORNES.comptes))
      const avertis = await prevenir(aPrevenir, AVIS_INACTIVITE, (id) =>
        db.from('compte').update({ prevenu_inactivite_le: new Date().toISOString() }).eq('id', id).is('prevenu_inactivite_le', null))
      const sansReponse = lu(await db.from('compte').select('id').eq('role', 'candidat').lt('derniere_connexion_le', limite)
        .lt('prevenu_inactivite_le', avant(DELAIS.avertissementJours)).limit(BORNES.comptes))
      const efface = await supprimer(sansReponse)
      return { avertis: avertis.envoyes, echecs_envoi: avertis.echecs, supprimes: efface.supprimes, echecs_suppression: efface.echecs }
    },
  }

  // Une tâche qui échoue n'arrête pas les suivantes : son code d'erreur remplace ses compteurs.
  const bilan: Record<string, Record<string, number> | { erreur: string }> = {}
  for (const [nom, tache] of Object.entries(taches)) {
    try {
      bilan[nom] = await tache()
    } catch (e) {
      const code = String((e as { code?: string; statusCode?: number }).code ?? (e as { statusCode?: number }).statusCode ?? 'erreur')
      bilan[nom] = { erreur: code }
    }
  }
  return bilan
}
