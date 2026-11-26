import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ENGAGEMENTS, ENGAGEMENTS_VERSION } from '../../shared/utils/engagements'

// Le texte des trois engagements et sa version vont ensemble : le texte accepté est celui que `engagement.version` désigne.
// Changer une phrase casse ce test jusqu'à ce que la version change aussi, et l'empreinte ci-dessous avec elle.
describe('engagements du Boss', () => {
  it('le texte et la version changent ensemble', () => {
    const empreinte = createHash('sha256').update(ENGAGEMENTS.join('\n')).digest('hex')
    expect({ version: ENGAGEMENTS_VERSION, empreinte }).toEqual({
      version: '2026-11-26',
      empreinte: '29752bc76620000bbcce0031ec6973cf11485f93757ac95772d4ca07875f8525',
    })
  })
})
