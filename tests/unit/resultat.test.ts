import { describe, expect, it } from 'vitest'
import { formaterNombre, lireSortie, ordinal, podium, type LigneClassement } from '../../shared/utils/resultat'

const ligne = (pseudo: string, rang: number | null): LigneClassement => ({
  pseudo, rang, score_claude: 70, note_boss: 7, score_final: 70, notes: {}, disqualifie: false, justification: null, justification_departage: null,
})

describe('lireSortie', () => {
  it('garde la forme d\'un audit et ignore tout le reste', () => {
    const s = lireSortie({
      criteres: [{ cle: 'tests', note: 7, justification: 'Bien.', preuves: [{ fichier: 'a.ts', ligne: 3, constat: 'x', extra: 1 }, { fichier: 'b.ts' }] }, { cle: 'sans-note' }],
      points_forts: ['a', 3, ''], a_ameliorer: 'pas une liste', manipulation_detectee: { detectee: true, preuves: [{ fichier: 'README.md', ligne: 1, constat: 'c' }] },
      verdict: 'convaincu', replique: 'Salut.', inattendu: 'ignoré',
    })
    expect(s).toEqual({
      criteres: [{ cle: 'tests', note: 7, justification: 'Bien.', preuves: [{ fichier: 'a.ts', ligne: 3, constat: 'x' }] }],
      points_forts: ['a'], a_ameliorer: [], manipulation: { detectee: true, preuves: [{ fichier: 'README.md', ligne: 1, constat: 'c' }] },
      verdict: 'convaincu', replique: 'Salut.',
    })
  })

  it.each([null, 'texte', 42, [], {}])('ne plante pas sur %j', (brut) => {
    const s = lireSortie(brut)
    expect(s.criteres).toEqual([])
    expect(s.replique).toBeNull()
    expect(s.verdict).toBeNull()
    expect(s.manipulation.detectee).toBe(false)
  })

  it('une réplique masquée (clé retirée par la vue) reste absente', () => {
    expect(lireSortie({ criteres: [], verdict: 'pas_convaincu' }).replique).toBeNull()
  })
})

describe('podium', () => {
  it('demande trois candidats classés', () => {
    expect(podium([ligne('a', 1), ligne('b', 2), ligne('c', null)])).toEqual([])
    expect(podium([ligne('a', 1), ligne('b', 2), ligne('c', 3), ligne('d', 4), ligne('e', null)]).map((l) => l.pseudo)).toEqual(['a', 'b', 'c'])
  })
})

describe('formats', () => {
  it('nombres à la française, un chiffre après la virgule', () => {
    expect(formaterNombre(66.6666)).toBe('66,7')
    expect(formaterNombre(null)).toBe('—')
    expect([1, 2, 3].map(ordinal)).toEqual(['1er', '2e', '3e'])
  })
})
