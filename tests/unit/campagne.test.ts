import { describe, expect, it } from 'vitest'
import { depuisChampLocal, versChampLocal } from '../../shared/utils/campagne'

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
})
