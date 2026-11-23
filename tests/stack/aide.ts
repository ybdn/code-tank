// Outils des tests d'intégration du dépôt : pile locale, serveur Nuxt construit, utilisateurs et campagnes simulés.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomInt } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const racine = fileURLToPath(new URL('../..', import.meta.url))
export const statut = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { cwd: racine, stdio: ['ignore', 'pipe', 'ignore'] }).toString())
export const API = statut.API_URL as string
export const admin = createClient(API, statut.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
export const anon = () => createClient(API, statut.ANON_KEY, { auth: { persistSession: false } })

// `env` s'ajoute à l'environnement de base. `sortie()` rend ce que le serveur a écrit (journal et erreurs).
export async function demarrer(port: number, env: Record<string, string> = {}): Promise<{ url: string; arreter: () => void; sortie: () => string }> {
  const proc: ChildProcess = spawn('node', ['.output/server/index.mjs'], {
    cwd: racine,
    env: {
      PATH: process.env.PATH,
      NITRO_PORT: String(port),
      NITRO_HOST: '127.0.0.1',
      NUXT_PUBLIC_SUPABASE_URL: API,
      NUXT_PUBLIC_SUPABASE_KEY: statut.ANON_KEY,
      NUXT_SUPABASE_SECRET_KEY: statut.SERVICE_ROLE_KEY,
      NUXT_SITE_URL: `http://127.0.0.1:${port}`,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let sortie = ''
  proc.stdout?.on('data', (d) => (sortie += d))
  proc.stderr?.on('data', (d) => (sortie += d))
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/')).ok) return { url, arreter: () => proc.kill(), sortie: () => sortie }
    } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  proc.kill()
  throw new Error('Le serveur Nuxt ne démarre pas (pnpm build fait ?)')
}

export type Utilisateur = { id: string; email: string; githubId: string; cookie: string; client: ReturnType<typeof anon> }
const crees: string[] = []

// Utilisateur simulé, sans compte : comme une vraie connexion, avec un user_metadata modifiable que le serveur ne doit pas croire.
export async function utilisateur(options: { provider?: string; githubId?: string } = {}): Promise<Utilisateur> {
  const provider = options.provider ?? 'github'
  const githubId = options.githubId ?? String(randomInt(1e6, 1e9))
  const email = `ada-${randomBytes(5).toString('hex')}@example.org`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'mot-de-passe-de-test-1',
    email_confirm: true,
    app_metadata: { provider, providers: [provider], ...(provider === 'github' ? { github_id: githubId } : {}) },
    user_metadata: { provider_id: 'faux-id-modifiable' },
  })
  if (error) throw error
  crees.push(data.user.id)
  const client = anon()
  const { data: connexion, error: e2 } = await client.auth.signInWithPassword({ email, password: 'mot-de-passe-de-test-1' })
  if (e2) throw e2
  // Cookie de session tel que l'écrit @supabase/ssr : base64url préfixé, découpé en morceaux de 3180 caractères.
  const valeur = 'base64-' + Buffer.from(JSON.stringify(connexion.session)).toString('base64url')
  const morceaux = valeur.match(/.{1,3180}/g)!
  const cookie = morceaux.length === 1 ? `sb-code-tank=${valeur}` : morceaux.map((m, i) => `sb-code-tank.${i}=${m}`).join('; ')
  return { id: data.user.id, email, githubId, cookie, client }
}

// Utilisateur avec un compte déjà créé à l'état demandé (la création par l'API est testée dans compte.test.ts).
export async function candidat(etat = 'autorise'): Promise<Utilisateur> {
  const u = await utilisateur()
  const maintenant = new Date().toISOString()
  const { error } = await admin.from('compte').insert({
    id: u.id, github_id: u.githubId, vrai_nom: 'Ada Lovelace', pseudo: 'ada' + randomBytes(4).toString('hex'), email_contact: u.email,
    motivation: 'Je code.', depot_cite_url: 'https://example.org/ada', majeur_declare_le: maintenant, charte_acceptee_le: maintenant,
    version_charte: '2026-12-01', etat: etat as 'autorise',
  })
  if (error) throw error
  return u
}

const ordre = ['brouillon', 'inscriptions', 'depot', 'deliberation', 'prete', 'publiee', 'archivee']
const campagnes: string[] = []
// Campagne créée en brouillon puis avancée d'un cran à la fois (le déclencheur contrôle l'ordre).
export async function campagne(cible: string, options: { cloture?: Date; max?: number; brief?: string } = {}) {
  const jour = 86_400_000
  const cloture = options.cloture ?? new Date(Date.now() + 7 * jour)
  const slug = 'test-' + randomBytes(6).toString('hex')
  const { data, error } = await admin.from('campagne').insert({
    slug, titre: 'Campagne de test', theme: 'Un minuteur', brief: options.brief ?? 'Écris un minuteur.',
    criteres: [{ cle: 'brief', libelle: 'Réponse au brief', poids: 100, jure: 'pitch' }],
    ouverture_inscriptions: new Date(cloture.getTime() - 30 * jour).toISOString(), cloture_depot: cloture.toISOString(),
    date_resultats: new Date(cloture.getTime() + 7 * jour).toISOString(), max_participants: options.max ?? 5,
  }).select('id').single()
  if (error) throw error
  campagnes.push(data.id)
  for (const s of ordre.slice(1, ordre.indexOf(cible) + 1)) {
    const { error: e } = await admin.from('campagne').update({ statut: s as 'depot' }).eq('id', data.id)
    if (e) throw e
  }
  return { id: data.id as string, slug }
}

export async function inscrire(c: { id: string }, u: Utilisateur) {
  const { data, error } = await admin.from('participation').insert({ campagne_id: c.id, compte_id: u.id }).select('id').single()
  if (error) throw error
  return data.id as string
}

// Supprime ce que les tests ont créé, archives comprises (la suppression en base ne touche pas le stockage).
export async function nettoyer() {
  for (const id of campagnes) {
    const { data } = await admin.from('participation').select('id').eq('campagne_id', id)
    for (const p of data ?? []) {
      const { data: objets } = await admin.storage.from('depots').list(`${id}/${p.id}`)
      if (objets?.length) await admin.storage.from('depots').remove(objets.map((o) => `${id}/${p.id}/${o.name}`))
    }
    await admin.from('campagne').delete().eq('id', id)
  }
  for (const id of crees) await admin.auth.admin.deleteUser(id)
}

export async function api(base: string, methode: string, chemin: string, u?: Utilisateur, corps?: unknown) {
  const r = await fetch(base + chemin, {
    method: methode,
    redirect: 'manual',
    headers: { ...(u ? { cookie: u.cookie } : {}), ...(corps ? { 'content-type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const texte = await r.text()
  let json: { ok?: boolean; chemin?: string; token?: string; resultat?: string; courrielEnvoye?: boolean; statusMessage?: string; data: { erreurs: Record<string, string> } } = { data: { erreurs: {} } }
  try { json = JSON.parse(texte) } catch { /* pas du JSON */ }
  return { statut: r.status, json, texte, location: r.headers.get('location') }
}

// Zip vide valide (fin de répertoire central seule) : le bucket contrôle le type et la taille, pas le contenu.
export const zip = (octets = 22) => {
  const b = new Uint8Array(octets)
  b.set([0x50, 0x4b, 0x05, 0x06])
  return new Blob([b], { type: 'application/zip' })
}
