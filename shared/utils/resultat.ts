import type { Critere } from './campagne'

// Résultats d'une campagne publiée : classement public, entretien et rapport du candidat.
// Les sorties des jurés viennent de Claude et du dépôt du candidat : rien n'est supposé de leur forme, tout est
// reconstruit champ par champ (lireSortie), et les pages les rendent comme du texte.

export const STATUTS_RESULTATS = ['publiee', 'archivee']
export const STATUTS_DELIBERATION = ['deliberation', 'prete']

// Ordre de l'entretien : les quatre jurés Claude, puis Le Boss.
export const JURES_CLAUDE = [
  { jure: 'sudo', nom: 'Sudo' },
  { jure: 'refacto', nom: 'Refacto' },
  { jure: 'lint', nom: 'Lint' },
  { jure: 'pitch', nom: 'Pitch' },
] as const

export type Preuve = { fichier: string; ligne: number; constat: string }
export type CritereAudit = { cle: string; note: number; justification: string; preuves: Preuve[] }
export type SortieJure = {
  criteres: CritereAudit[]
  points_forts: string[]
  a_ameliorer: string[]
  manipulation: { detectee: boolean; preuves: Preuve[] }
  verdict: 'convaincu' | 'pas_convaincu' | null
  // Absente quand l'organisateur l'a masquée : la vue `rapport` retire alors la clé.
  replique: string | null
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const textes = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : [])
const preuves = (v: unknown): Preuve[] =>
  (Array.isArray(v) ? v : []).flatMap((p) =>
    estObjet(p) && typeof p.fichier === 'string' && typeof p.constat === 'string' && Number.isInteger(p.ligne)
      ? [{ fichier: p.fichier, ligne: p.ligne as number, constat: p.constat }]
      : [])

export function lireSortie(brut: unknown): SortieJure {
  const r = estObjet(brut) ? brut : {}
  const m = estObjet(r.manipulation_detectee) ? r.manipulation_detectee : {}
  return {
    criteres: (Array.isArray(r.criteres) ? r.criteres : []).flatMap((c) =>
      estObjet(c) && typeof c.cle === 'string' && typeof c.note === 'number'
        ? [{ cle: c.cle, note: c.note, justification: typeof c.justification === 'string' ? c.justification : '', preuves: preuves(c.preuves) }]
        : []),
    points_forts: textes(r.points_forts),
    a_ameliorer: textes(r.a_ameliorer),
    manipulation: { detectee: m.detectee === true, preuves: preuves(m.preuves) },
    verdict: r.verdict === 'convaincu' || r.verdict === 'pas_convaincu' ? r.verdict : null,
    replique: typeof r.replique === 'string' && r.replique.trim() !== '' ? r.replique : null,
  }
}

export type LigneClassement = {
  pseudo: string
  rang: number | null
  score_claude: number | null
  note_boss: number | null
  score_final: number | null
  notes: Record<string, number | null>
  disqualifie: boolean
  justification: string | null
  justification_departage: string | null
}

export type ResultatCandidat = {
  titre: string
  criteres: Critere[]
  ligne: LigneClassement | null
  demande: string | null
  jures: { jure: string; sortie: SortieJure }[]
}

// Le podium ne s'affiche qu'à partir de trois candidats classés ; sinon, le classement seul.
export const PODIUM_MINIMUM = 3
export const classes = (lignes: LigneClassement[]) => lignes.filter((l) => l.rang !== null)
export const podium = (lignes: LigneClassement[]) => (classes(lignes).length >= PODIUM_MINIMUM ? lignes.filter((l) => l.rang !== null && l.rang <= 3) : [])

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
export const formaterNombre = (n: number | null | undefined) => (typeof n === 'number' ? nombre.format(n) : '—')
export const ordinal = (rang: number) => (rang === 1 ? '1er' : `${rang}e`)
export const libelleVerdict = (v: SortieJure['verdict']) => (v === 'convaincu' ? 'Convaincu' : v === 'pas_convaincu' ? 'Pas convaincu' : null)
