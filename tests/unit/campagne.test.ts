import { describe, expect, it } from 'vitest'
import { etapePublique, joursAvant } from '../../shared/utils/campagne'

describe('ce que le public voit du cycle', () => {
  it('« prête » reste la délibération, « archivée » garde ses résultats', () => {
    expect(etapePublique('prete')).toBe('deliberation')
    expect(etapePublique('archivee')).toBe('publiee')
    expect(etapePublique('depot')).toBe('depot')
  })
  it('jours restants : jours de calendrier à Paris, pas des tranches de 24 heures', () => {
    const maintenant = Date.parse('2026-12-10T08:00:00.000Z') // 10 décembre, 9 h à Paris
    expect(joursAvant('2026-12-15T09:00:00.000Z', maintenant)).toBe(5)
    expect(joursAvant('2026-12-10T17:00:00.000Z', maintenant)).toBe(0) // ferme ce soir : aujourd'hui, pas demain
    expect(joursAvant('2026-12-10T23:30:00.000Z', maintenant)).toBe(1) // 00 h 30 le 11 à Paris
    expect(joursAvant('2026-12-09T12:00:00.000Z', maintenant)).toBe(-1)
  })
})
