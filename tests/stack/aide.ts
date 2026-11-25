// Outils des tests contre la pile locale : statut de Supabase et serveur Nuxt construit (pnpm build fait).
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('../..', import.meta.url))
export const statut = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { cwd: racine, stdio: ['ignore', 'pipe', 'ignore'] }).toString())

// `env` s'ajoute à l'environnement de base (Supabase local).
export async function demarrer(port: number, env: Record<string, string> = {}): Promise<{ url: string; arreter: () => void }> {
  const proc: ChildProcess = spawn('node', ['.output/server/index.mjs'], {
    cwd: racine,
    env: {
      PATH: process.env.PATH,
      NITRO_PORT: String(port),
      NITRO_HOST: '127.0.0.1',
      NUXT_PUBLIC_SUPABASE_URL: statut.API_URL,
      NUXT_PUBLIC_SUPABASE_KEY: statut.ANON_KEY,
      NUXT_SUPABASE_SECRET_KEY: statut.SERVICE_ROLE_KEY,
      ...env,
    },
    stdio: 'ignore',
  })
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/')).ok) return { url, arreter: () => proc.kill() }
    } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  proc.kill()
  throw new Error('Le serveur Nuxt ne démarre pas (pnpm build fait ?)')
}
