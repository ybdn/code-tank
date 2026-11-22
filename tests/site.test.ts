import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

const racine = fileURLToPath(new URL('..', import.meta.url))

// Lance le serveur de rendu côté serveur sur le build.
await setup({ rootDir: racine, server: true })

const fichiers = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? fichiers(join(dir, f)) : [join(dir, f)]))

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
})

describe('aucune note interne publiée', () => {
  it('content/ ne contient ni notes de rédaction, ni « À COMPLÉTER », ni commentaire HTML', () => {
    for (const f of fichiers(join(racine, 'content'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/Notes de rédaction|À COMPLÉTER|<!--/)
    }
  })

  it('le build public ne contient ni notes de rédaction ni « À COMPLÉTER »', () => {
    const sortie = join(racine, '.output/public')
    for (const f of fichiers(sortie)) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/Notes de rédaction|À COMPLÉTER/)
    }
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
