// Socle contre la pile locale : le site construit répond, et la tâche planifiée reste fermée sans son secret.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const racine = fileURLToPath(new URL('../..', import.meta.url))
const statut = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { cwd: racine, stdio: ['ignore', 'pipe', 'ignore'] }).toString())
const url = 'http://127.0.0.1:3911'
let serveur: ChildProcess

beforeAll(async () => {
  serveur = spawn('node', ['.output/server/index.mjs'], {
    cwd: racine,
    env: {
      PATH: process.env.PATH,
      NITRO_PORT: '3911',
      NITRO_HOST: '127.0.0.1',
      NUXT_PUBLIC_SUPABASE_URL: statut.API_URL,
      NUXT_PUBLIC_SUPABASE_KEY: statut.ANON_KEY,
      NUXT_SUPABASE_SECRET_KEY: statut.SERVICE_ROLE_KEY,
    },
    stdio: 'ignore',
  })
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/')).ok) return
    } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('Le serveur Nuxt ne démarre pas (pnpm build fait ?)')
})
afterAll(() => serveur?.kill())

describe('socle', () => {
  it('l\'accueil répond avec l\'accroche', async () => {
    const r = await fetch(url + '/')
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('Affronte notre jury.')
  })

  it('le cron sans secret répond 404', async () => {
    expect((await fetch(url + '/api/cron/conservation')).status).toBe(404)
    expect((await fetch(url + '/api/cron/conservation', { headers: { authorization: 'Bearer faux' } })).status).toBe(404)
  })
})
