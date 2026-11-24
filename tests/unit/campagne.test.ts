import { describe, expect, it } from 'vitest'
import { etapePublique, joursAvant } from '../../shared/utils/campagne'

describe('ce que le public voit du cycle', () => {
  it('« prête » reste la délibération, « archivée » garde ses résultats', () => {
    expect(etapePublique('prete')).toBe('deliberation')
    expect(etapePublique('archivee')).toBe('publiee')
    expect(etapePublique('depot')).toBe('depot')
  })
  it('jours restants : entiers, arrondis vers le haut, négatifs une fois passés', () => {
    const maintenant = Date.parse('2026-12-10T12:00:00.000Z')
    expect(joursAvant('2026-12-15T09:00:00.000Z', maintenant)).toBe(5)
    expect(joursAvant('2026-12-10T18:00:00.000Z', maintenant)).toBe(1)
    expect(joursAvant('2026-12-10T12:00:00.000Z', maintenant)).toBe(0)
    expect(joursAvant('2026-12-09T12:00:00.000Z', maintenant)).toBe(-1)
  })
})
