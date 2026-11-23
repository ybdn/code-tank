import { describe, expect, it } from 'vitest'
import { creerJeton, verifierJeton } from '../../server/utils/jeton'

const secret = 'secret-de-test'
const id = '6f1e5a0e-7a53-4a40-8f6a-0d8f4a0b1c2d'

describe('jeton de vérification', () => {
  it('accepte un jeton valide et rend le compte et l\'adresse', () => {
    expect(verifierJeton(creerJeton(id, 'Moi@Example.org', secret), secret)).toEqual({ ok: true, compteId: id, email: 'moi@example.org' })
  })
  it('refuse un jeton expiré (24 h)', () => {
    const t = 1_000_000_000_000
    const jeton = creerJeton(id, 'a@b.fr', secret, t)
    expect(verifierJeton(jeton, secret, t + 24 * 3600_000 - 1000).ok).toBe(true)
    expect(verifierJeton(jeton, secret, t + 24 * 3600_000)).toEqual({ ok: false, raison: 'expire' })
  })
  it('refuse un jeton falsifié (charge ou signature)', () => {
    const [charge, signature] = creerJeton(id, 'a@b.fr', secret).split('.')
    const autre = Buffer.from(JSON.stringify({ c: id, e: 'pirate@b.fr', x: 9_999_999_999 })).toString('base64url')
    expect(verifierJeton(`${autre}.${signature}`, secret)).toEqual({ ok: false, raison: 'invalide' })
    expect(verifierJeton(`${charge}.${signature.slice(0, -2)}AA`, secret).ok).toBe(false)
    expect(verifierJeton(`${charge}.`, secret).ok).toBe(false)
    expect(verifierJeton('n-importe-quoi', secret).ok).toBe(false)
  })
  it('refuse un jeton signé avec un autre secret, ou sans secret', () => {
    const jeton = creerJeton(id, 'a@b.fr', secret)
    expect(verifierJeton(jeton, 'autre').ok).toBe(false)
    expect(verifierJeton(creerJeton(id, 'a@b.fr', ''), '').ok).toBe(false)
  })
  it('porte l\'adresse : un jeton pour une adresse ne vaut pas pour une autre', () => {
    const r = verifierJeton(creerJeton(id, 'ancienne@b.fr', secret), secret)
    expect(r.ok && r.email).toBe('ancienne@b.fr')
    expect(r.ok && r.email === 'nouvelle@b.fr').toBe(false)
  })
})
