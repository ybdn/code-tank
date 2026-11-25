import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup, useTestContext } from '@nuxt/test-utils/e2e'

const racine = fileURLToPath(new URL('..', import.meta.url))

// Le module Supabase exige une URL et une clé publique pour rendre les pages ; valeurs factices. Le port 9 (discard)
// est fermé : Supabase est injoignable, comme pile arrêtée ou base en panne.
process.env.NUXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
process.env.NUXT_PUBLIC_SUPABASE_KEY = 'cle-publique-factice'

// Lance le serveur de rendu côté serveur sur le build.
await setup({ rootDir: racine, server: true })

const fichiers = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? fichiers(join(dir, f)) : [join(dir, f)]))

describe('pages publiques', () => {
  it.each([
    ['/', 'Affronte notre jury.'],
    ['/charte', 'Charte'],
    ['/confidentialite', 'confidentialité'],
    ['/mentions-legales', 'Mentions légales'],
  ])('%s répond avec son contenu rendu côté serveur', async (chemin, texte) => {
    expect(await $fetch<string>(chemin)).toContain(texte)
  })
})

describe('code du concours supprimé', () => {
  it('l\'accueil n\'a plus ni ancienne accroche ni liste de campagnes', async () => {
    const html = await $fetch<string>('/')
    expect(html).not.toContain('Ton code face au jury')
    expect(html).not.toContain('Le concours de code jugé par ybdn')
    expect(html).not.toContain('id="campagnes"')
  })

  it.each(['/compte', '/admin', '/campagnes/une-campagne', '/api/campagnes', '/api/compte', '/api/admin/comptes'])('%s répond 404', async (chemin) => {
    expect((await fetch(chemin, { redirect: 'manual' })).status).toBe(404)
  })
})

describe('aucune note interne publiée', () => {
  it('content/ ne contient ni notes de rédaction, ni « À COMPLÉTER », ni commentaire HTML', () => {
    for (const f of fichiers(join(racine, 'content'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/Notes de rédaction|À COMPLÉTER|<!--/)
    }
  })

  it('le build public ne contient ni notes de rédaction ni « À COMPLÉTER »', () => {
    // `setup()` construit hors de `.output` (dans `.nuxt/test/<id>/output`) : lire ce build-là, pas un ancien `pnpm build`.
    const sortie = join(useTestContext().options.nuxtConfig.nitro!.output!.dir!, 'public')
    expect(statSync(sortie).isDirectory()).toBe(true)
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
    // Origine exacte de Supabase, sans joker.
    expect(csp).toMatch(/connect-src 'self' http:\/\/127\.0\.0\.1:9(;|$)/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('strict-transport-security')).toBeTruthy()
  })
})
