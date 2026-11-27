import { describe, expect, it } from 'vitest'
import { courrielFin } from '../../server/utils/courriel'

describe('e-mail « délibération terminée »', () => {
  it('objet préfixé, tutoiement, lien direct vers l\'espace du Boss sans paramètre', () => {
    const { sujet, texte } = courrielFin('https://code-tank.ybdn.io', 'mon-defi', 'Mon défi')
    expect(sujet).toBe('Code Tank — Mon défi : la délibération est terminée')
    expect(texte).toContain('ta campagne « Mon défi »')
    const liens = texte.match(/https?:\/\/\S+/g)
    expect(liens).toEqual(['https://code-tank.ybdn.io/boss/mon-defi'])
  })
  it('un titre à retours à la ligne ne casse pas l\'objet', () => {
    const { sujet } = courrielFin('https://x.test', 's', 'Ligne 1\r\nBcc: autre@example.org\u2028fin')
    expect(sujet).toBe('Code Tank — Ligne 1 Bcc: autre@example.org fin : la délibération est terminée')
    expect(sujet).not.toMatch(/[\r\n\u2028]/)
  })
  it('une URL du site terminée par / ne donne pas de double slash', () => {
    expect(courrielFin('https://code-tank.ybdn.io/', 's', 'T').texte).toContain('https://code-tank.ybdn.io/boss/s')
    expect(courrielFin('https://code-tank.ybdn.io/', 's', 'T').texte).not.toContain('//boss')
  })
})
