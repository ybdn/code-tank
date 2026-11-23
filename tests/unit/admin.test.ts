import { describe, expect, it } from 'vitest'
import {
  CRITERES_PAR_DEFAUT, cheminAdmin, contradictionsIa, depuisChampLocal, etapeSuivante, validerCampagne, validerReglages, versChampLocal,
} from '../../shared/utils/admin'

const valide = () => ({
  slug: 'minuteur-de-pause', titre: 'Minuteur', theme: 'Un minuteur', brief: 'Écris un minuteur.', criteres: structuredClone(CRITERES_PAR_DEFAUT),
  ouverture_inscriptions: '2026-12-01T09:00:00.000Z', cloture_depot: '2026-12-15T09:00:00.000Z', date_resultats: '2026-12-31T09:00:00.000Z', max_participants: 10,
})

describe('cheminAdmin : tout ce qui mène à l\'administration est contrôlé', () => {
  it.each(['/admin', '/admin/', '/admin/comptes', '/Admin', '/ADMIN/x', '/%61dmin', '//admin', '/api/admin/comptes', '/api//admin', '/API/Admin/x', '/admin?x=1', '/admin%zz'])('%s', (c) => {
    expect(cheminAdmin(c)).toBe(true)
  })
  it.each(['/', '/administrateur', '/compte', '/campagnes/admin', '/api/campagnes', '/api/compte/admin'])('%s n\'en fait pas partie', (c) => {
    expect(cheminAdmin(c)).toBe(false)
  })
})

describe('dates à l\'heure de Paris', () => {
  it('aller-retour, heure d\'hiver et heure d\'été', () => {
    expect(depuisChampLocal('2026-12-01T09:30')).toBe('2026-12-01T08:30:00.000Z')
    expect(depuisChampLocal('2026-07-01T09:30')).toBe('2026-07-01T07:30:00.000Z')
    expect(versChampLocal('2026-12-01T08:30:00.000Z')).toBe('2026-12-01T09:30')
    expect(versChampLocal('2026-07-01T07:30:00.000Z')).toBe('2026-07-01T09:30')
  })
  it('autour du changement d\'heure (29 mars 2026, 02:00 → 03:00)', () => {
    expect(depuisChampLocal('2026-03-29T01:59')).toBe('2026-03-29T00:59:00.000Z')
    expect(depuisChampLocal('2026-03-29T03:00')).toBe('2026-03-29T01:00:00.000Z')
  })
  it('une saisie vide ou invalide donne une chaîne vide', () => {
    expect(depuisChampLocal('')).toBe('')
  })
})

describe('validerCampagne', () => {
  it('accepte une campagne valide et normalise les critères', () => {
    const { campagne, erreurs } = validerCampagne(valide())
    expect(erreurs).toEqual({})
    expect(campagne.criteres).toHaveLength(8)
    expect(campagne.criteres.find((c) => c.cle === 'outillage')?.calcule).toBe(true)
    expect(campagne.criteres.reduce((s, c) => s + c.poids, 0)).toBe(100)
  })
  it('ne contrôle pas le total des poids : la base le fait à l\'ouverture', () => {
    const c = valide()
    c.criteres[0]!.poids = 5
    expect(validerCampagne(c).erreurs).toEqual({})
  })
  it.each([
    ['slug majuscules', { slug: 'Minuteur' }, 'slug'],
    ['slug vide', { slug: '' }, 'slug'],
    ['titre vide', { titre: '  ' }, 'titre'],
    ['brief trop long', { brief: 'x'.repeat(5001) }, 'brief'],
    ['date illisible', { cloture_depot: 'demain' }, 'cloture_depot'],
    ['clôture avant l\'ouverture', { cloture_depot: '2026-11-01T00:00:00.000Z' }, 'cloture_depot'],
    ['résultats avant la clôture', { date_resultats: '2026-12-10T00:00:00.000Z' }, 'date_resultats'],
    ['participants nul', { max_participants: 0 }, 'max_participants'],
    ['participants décimal', { max_participants: 2.5 }, 'max_participants'],
    ['participants en texte', { max_participants: '10' }, 'max_participants'],
    ['aucun critère', { criteres: [] }, 'criteres'],
    ['poids décimal', { criteres: [{ cle: 'a', libelle: 'A', poids: 10.5, jure: 'sudo' }] }, 'criteres'],
    ['poids négatif', { criteres: [{ cle: 'a', libelle: 'A', poids: -1, jure: 'sudo' }] }, 'criteres'],
    ['juré inconnu', { criteres: [{ cle: 'a', libelle: 'A', poids: 100, jure: 'boss' }] }, 'criteres'],
    ['clé en double', { criteres: [{ cle: 'a', libelle: 'A', poids: 50, jure: 'sudo' }, { cle: 'a', libelle: 'B', poids: 50, jure: 'lint' }] }, 'criteres'],
    ['libellé vide', { criteres: [{ cle: 'a', libelle: ' ', poids: 100, jure: 'sudo' }] }, 'criteres'],
  ])('refuse : %s', (_nom, surcharge, champ) => {
    expect(validerCampagne({ ...valide(), ...surcharge }).erreurs).toHaveProperty(champ)
  })
})

describe('validerReglages', () => {
  it('plafond vide = aucun plafond', () => {
    expect(validerReglages({ plafond_comptes: '', plafond_depense_usd: 50 })).toEqual({ reglages: { plafond_comptes: null, plafond_depense_usd: 50 }, erreurs: {} })
    expect(validerReglages({ plafond_comptes: 0, plafond_depense_usd: 12.5 }).erreurs).toEqual({})
  })
  it.each([[-1, 50], [1.5, 50], ['a', 50], [10, 0], [10, -3], [10, 1.234], [10, '50'], [10, 1e8]])('refuse %s / %s', (plafond, depense) => {
    expect(Object.keys(validerReglages({ plafond_comptes: plafond, plafond_depense_usd: depense }).erreurs)).not.toHaveLength(0)
  })
})

describe('contradictionsIa : traces comparées aux outils déclarés', () => {
  it('rien à signaler sans trace', () => {
    expect(contradictionsIa([], [])).toEqual([])
    expect(contradictionsIa(['Claude Code'], [])).toEqual([])
  })
  it('aucun outil déclaré mais des traces', () => {
    expect(contradictionsIa([], ['.cursor/'])[0]).toContain('Aucun outil d\'IA déclaré')
  })
  it('une trace d\'un outil absent de la déclaration', () => {
    expect(contradictionsIa(['Claude Code'], [{ outil: 'Cursor' }])).toEqual(['Trace de « Cursor », absent des outils déclarés.'])
    expect(contradictionsIa(['Claude Code'], [{ outil: 'claude code' }])).toEqual([])
  })
})

describe('étapes', () => {
  it('la suite suit l\'ordre du cycle', () => {
    expect(etapeSuivante('brouillon')).toBe('inscriptions')
    expect(etapeSuivante('prete')).toBe('publiee')
    expect(etapeSuivante('archivee')).toBeNull()
  })
})
