import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup, useTestContext } from '@nuxt/test-utils/e2e'

// Seules les variables de l'intégration Vercel/Supabase (SUPABASE_*) sont définies, avec des clés au nouveau format factices.
delete process.env.NUXT_PUBLIC_SUPABASE_URL
delete process.env.NUXT_PUBLIC_SUPABASE_KEY
delete process.env.NUXT_SUPABASE_SECRET_KEY
const secret = 'sb_secret_factice_a_ne_jamais_publier'
process.env.SUPABASE_URL = 'http://127.0.0.1:9'
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_factice'
process.env.SUPABASE_SECRET_KEY = secret

await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)), server: true })

const fichiers = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? fichiers(join(dir, f)) : [join(dir, f)]))

describe('variables de l\'intégration Supabase de Vercel', () => {
  it('la CSP autorise l\'URL SUPABASE_URL', async () => {
    const csp = (await fetch('/')).headers.get('content-security-policy') ?? ''
    expect(csp).toMatch(/connect-src 'self' http:\/\/127\.0\.0\.1:9(;|$)/)
  })

  it('la clé publique est lue ; la clé secrète n\'est ni dans la page rendue ni dans le build public', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('sb_publishable_factice')
    expect(html).not.toContain(secret)
    // `setup()` construit dans `.nuxt/test/<id>/output`, pas dans `.output`.
    const sortie = join(useTestContext().options.nuxtConfig.nitro!.output!.dir!, 'public')
    const liste = fichiers(sortie)
    expect(liste.length).toBeGreaterThan(0)
    for (const f of liste) expect(readFileSync(f, 'utf8'), f).not.toContain(secret)
  })
})
