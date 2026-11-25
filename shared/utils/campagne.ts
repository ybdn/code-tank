// Ce que le public voit du cycle : « prête » reste la délibération, « archivée » garde ses résultats.
export const ETAPES_PUBLIQUES = ['inscriptions', 'depot', 'deliberation', 'publiee'] as const
export const LIBELLE_ETAPE_PUBLIQUE: Record<string, string> = { inscriptions: 'Inscriptions', depot: 'Dépôt', deliberation: 'Délibération', publiee: 'Résultats' }
export const etapePublique = (statut: string) => ({ prete: 'deliberation', archivee: 'publiee' } as Record<string, string>)[statut] ?? statut

// Campagne du Boss (story 2.1) : la forme renvoyée par /api/boss/[slug] et les libellés de ses actes (AD-2).
export type CampagneBoss = {
  id: string; slug: string; titre: string; theme: string; brief: string; langages: string[]
  visibilite: 'publique' | 'invitation'; role_boss: 'juge' | 'joueur'; max_participants: number
  ouverture_inscriptions: string; cloture_depot: string; date_resultats: string
  statut: string; regles_figees_le: string | null; bloquee_le: string | null; cree_le: string
  // Compte de l'appelant actif : sinon, ni réglage ni suppression.
  compte_actif: boolean
}
export const STATUT_BOSS: Record<string, string> = {
  brouillon: 'Brouillon', ouverte: 'Ouverte', deliberation: 'Délibération', prete: 'Prête', publiee: 'Publiée', archivee: 'Archivée', expiree: 'Expirée',
}
export const STATUTS_ACTIFS = ['brouillon', 'ouverte', 'deliberation', 'prete']

// Les dates se saisissent à l'heure de Paris, quel que soit le fuseau du navigateur.
const champLocal = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
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
