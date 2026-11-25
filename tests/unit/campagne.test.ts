import { describe, expect, it } from 'vitest'
import { brouillonEchu, depuisChampLocal, versChampLocal } from '../../shared/utils/campagne'

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
    expect(depuisChampLocal('2026-13-45')).toBe('')
  })
  it('une date impossible ou une heure absente à Paris donne une chaîne vide', () => {
    expect(depuisChampLocal('2027-02-30T09:30')).toBe('')
    expect(depuisChampLocal('2026-03-29T02:30')).toBe('')
  })
})

describe('brouillon échu', () => {
  const maintenant = Date.parse('2026-12-01T12:00:00Z')
  it('seul un brouillon non bloqué dont la date des résultats est passée est échu', () => {
    expect(brouillonEchu({ statut: 'brouillon', bloquee_le: null, date_resultats: '2026-12-01T11:59:00Z' }, maintenant)).toBe(true)
    expect(brouillonEchu({ statut: 'brouillon', bloquee_le: null, date_resultats: '2026-12-01T12:01:00Z' }, maintenant)).toBe(false)
    expect(brouillonEchu({ statut: 'brouillon', bloquee_le: '2026-11-30T00:00:00Z', date_resultats: '2026-12-01T11:59:00Z' }, maintenant)).toBe(false)
    expect(brouillonEchu({ statut: 'ouverte', bloquee_le: null, date_resultats: '2026-12-01T11:59:00Z' }, maintenant)).toBe(false)
  })
})
