// Outils des tests contre la pile locale : statut de Supabase, serveur Nuxt construit (pnpm build fait), utilisateurs.
// Une vraie connexion GitHub est impossible ici : l'utilisateur est créé par l'API d'administration d'Auth, son identité
// github est ajoutée en SQL dans auth.identities (ce qu'écrit Auth à la connexion), puis sa session est ouverte par mot de passe.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomInt } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('../..', import.meta.url))
export const statut = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { cwd: racine, stdio: ['ignore', 'pipe', 'ignore'] }).toString())

// `env` s'ajoute à l'environnement de base (Supabase local).
// `journal()` rend tout ce que le serveur a écrit sur sa sortie et son erreur.
export async function demarrer(port: number, env: Record<string, string> = {}): Promise<{ url: string; arreter: () => void; journal: () => string }> {
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
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let sortie = ''
  proc.stdout?.on('data', (d) => { sortie += d })
  proc.stderr?.on('data', (d) => { sortie += d })
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/')).ok) return { url, arreter: () => proc.kill(), journal: () => sortie }
    } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  proc.kill()
  throw new Error('Le serveur Nuxt ne démarre pas (pnpm build fait ?)')
}

export const API = statut.API_URL as string
const service = { apikey: statut.SERVICE_ROLE_KEY, authorization: `Bearer ${statut.SERVICE_ROLE_KEY}`, 'content-type': 'application/json' }
export const sql = (requete: string) => execFileSync('docker', ['exec', 'supabase_db_code-tank-site', 'psql', '-U', 'postgres', '-d', 'postgres', '-c', requete], { stdio: 'pipe' })

export type Utilisateur = { id: string; email: string; githubId: string }
const crees: string[] = []
const MOT_DE_PASSE = 'mot-de-passe-de-test-1'

export async function utilisateur(github = true): Promise<Utilisateur> {
  const email = `ada-${randomBytes(5).toString('hex')}@example.org`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: service, body: JSON.stringify({ email, password: MOT_DE_PASSE, email_confirm: true }) })
  const { id } = await r.json() as { id: string }
  crees.push(id)
  const githubId = String(randomInt(1e6, 1e9))
  if (github) sql(`insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at) values ('${id}', 'github', '${githubId}', '{"sub":"${githubId}"}', now(), now())`)
  return { id, email, githubId }
}

// Nouvelle session (une connexion) ; le cookie est celui qu'écrit @supabase/ssr : base64url préfixé, en morceaux de 3180.
export async function connexion(u: Utilisateur) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: statut.ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: MOT_DE_PASSE }),
  })
  const session = await r.json() as { access_token: string }
  const valeur = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const morceaux = valeur.match(/.{1,3180}/g)!
  const cookie = morceaux.length === 1 ? `sb-code-tank=${valeur}` : morceaux.map((m, i) => `sb-code-tank.${i}=${m}`).join('; ')
  return { cookie, jeton: session.access_token }
}

// Lecture de compte avec le jeton de l'utilisateur, sous RLS, comme la page /compte.
export const lireCompte = async (jeton: string) =>
  (await fetch(`${API}/rest/v1/compte?select=id,github_id,pseudo,version_charte,role,etat`, { headers: { apikey: statut.ANON_KEY, authorization: `Bearer ${jeton}` } })).json()

// Supprime les utilisateurs créés ; leur compte suit (cascade).
export async function nettoyer() {
  for (const id of crees.splice(0)) await fetch(`${API}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: service })
}
