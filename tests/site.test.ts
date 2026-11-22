import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

// Lance le serveur de rendu côté serveur sur le build.
await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)), server: true })

describe('pages publiques', () => {
  it.each([
    ['/', 'Concours de code jugé par Claude'],
    ['/charte', 'Charte'],
    ['/confidentialite', 'confidentialité'],
    ['/mentions-legales', 'Mentions légales'],
    ['/compte', 'Bientôt'],
  ])('%s répond avec son contenu rendu côté serveur', async (chemin, texte) => {
    expect(await $fetch<string>(chemin)).toContain(texte)
  })

  it("n'affiche pas les notes de rédaction", async () => {
    expect(await $fetch<string>('/mentions-legales')).not.toContain('Notes de rédaction')
  })
})

describe('en-têtes de sécurité', () => {
  it('envoie une CSP stricte avec nonce, sans unsafe-inline', async () => {
    const res = await fetch('/')
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toMatch(/script-src [^;]*'nonce-/)
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('strict-transport-security')).toBeTruthy()
  })
})
