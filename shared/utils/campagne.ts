// Phase publique, calculée par la vue campagne_phase (story 2.2) : inscription et dépôt sont ouverts ensemble ; « prête »
// reste la délibération pour le public, « archivée » garde ses résultats.
export const LIBELLE_PHASE: Record<string, string> = {
  a_venir: 'Inscriptions à venir', inscriptions: 'Inscriptions et dépôts ouverts', depots_clos: 'Dépôts clos',
  deliberation: 'Délibération', prete: 'Délibération', publiee: 'Résultats publiés', archivee: 'Résultats publiés',
}
// Une ligne de la vue campagne_phase, et un critère du jury lu dans critere (AD-8).
export type CampagnePublique = {
  slug: string; titre: string; theme: string; brief: string; langages: string[]
  visibilite: 'publique' | 'invitation'; role_boss: 'juge' | 'joueur'; max_participants: number; places_restantes: number
  ouverture_inscriptions: string; cloture_depot: string; date_resultats: string; statut: string; phase: string; boss_pseudo: string
}
export type Critere = { cle: string; libelle: string; jure: string; poids: number; calcule: boolean }

// Campagne du Boss (story 2.1) : la forme renvoyée par /api/boss/[slug] et les libellés de ses actes (AD-2).
export type CampagneBoss = {
  id: string; slug: string; titre: string; theme: string; brief: string; langages: string[]
  visibilite: 'publique' | 'invitation'; role_boss: 'juge' | 'joueur'; max_participants: number
  ouverture_inscriptions: string; cloture_depot: string; date_resultats: string
  statut: string; regles_figees_le: string | null; bloquee_le: string | null; cree_le: string
  // Lien secret d'une campagne sur invitation (story 2.4), nul pour une publique : lu par le Boss seul.
  jeton_invitation: string | null
  // Compte de l'appelant actif : sinon, ni réglage ni suppression.
  compte_actif: boolean
  // Inscrits (story 2.3) : dès le premier, la visibilité ne change plus.
  inscrits: number
}
export const STATUT_BOSS: Record<string, string> = {
  brouillon: 'Brouillon', ouverte: 'Ouverte', deliberation: 'Délibération', prete: 'Prête', publiee: 'Publiée', archivee: 'Archivée', expiree: 'Expirée',
}
export const STATUTS_ACTIFS = ['brouillon', 'ouverte', 'deliberation', 'prete']
// Brouillon échu et non bloqué : il ne compte plus comme campagne active, creer_campagne le fait passer en expiree.
export const brouillonEchu = (c: { statut: string; bloquee_le: string | null; date_resultats: string }, maintenant = Date.now()) =>
  c.statut === 'brouillon' && !c.bloquee_le && Date.parse(c.date_resultats) < maintenant

// Les dates se saisissent à l'heure de Paris, quel que soit le fuseau du navigateur.
const champLocal = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
// « 1 décembre 2026 à 09:30 », heure de Paris : la même au rendu serveur et dans le navigateur.
const dateLongue = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' })
export const dateParis = (iso: string) => dateLongue.format(new Date(iso))
// « 2026-12-01T09:30 » : la valeur d'un champ datetime-local.
export const versChampLocal = (iso: string) => champLocal.format(new Date(iso)).replace(' ', 'T')
// Inverse de versChampLocal. Le décalage est recalculé à l'instant trouvé pour tomber juste autour du changement d'heure.
export function depuisChampLocal(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return ''
  const t = Date.parse(`${local}:00Z`)
  if (Number.isNaN(t)) return ''
  const decalage = (instant: number) => Date.parse(`${versChampLocal(new Date(instant).toISOString())}:00Z`) - instant
  const iso = new Date(t - decalage(t - decalage(t))).toISOString()
  // Une date impossible (30 février, normalisée par Date.parse) ou une heure absente à Paris (changement d'heure) ne
  // revient pas à la saisie : refusée.
  return versChampLocal(iso) === local ? iso : ''
}
