// Appel du jury contre la pile locale, avec un faux jury (petit serveur HTTP) : après un dépôt, par le bouton de l'organisateur
// et par la tâche quotidienne ; et le bail d'exclusion (prendre_verrou / rendre_verrou) sous appels simultanés.
import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anon, api, campagne, candidat, demarrer, ipNeuve, nettoyer, organisateur, utilisateur, zip, type Utilisateur } from './aide'

const SECRET = 'jury-' + randomBytes(20).toString('hex')
const CRON = 'cron-' + randomBytes(20).toString('hex')
const recus: { methode?: string; url?: string; autorisation?: string }[] = []
let reponse = 202
let fauxJury: Server
let urlJury: string
let serveur: Awaited<ReturnType<typeof demarrer>>
let sansJury: Awaited<ReturnType<typeof demarrer>>
let injoignable: Awaited<ReturnType<typeof demarrer>>
let orga: Utilisateur

beforeAll(async () => {
  fauxJury = createServer((req, res) => {
    recus.push({ methode: req.method, url: req.url, autorisation: req.headers.authorization })
    res.statusCode = reponse
    res.end('{}')
  })
  await new Promise<void>((r) => fauxJury.listen(0, '127.0.0.1', r))
  urlJury = `http://127.0.0.1:${(fauxJury.address() as AddressInfo).port}/api/jury`
  serveur = await demarrer(3430, { NUXT_JURY_URL: urlJury, NUXT_JURY_SECRET: SECRET, CRON_SECRET: CRON })
  injoignable = await demarrer(3431, { NUXT_JURY_URL: 'http://127.0.0.1:1/api/jury', NUXT_JURY_SECRET: SECRET })
  sansJury = await demarrer(3432)
  orga = await organisateur()
})
afterAll(async () => {
  for (const s of [serveur, injoignable, sansJury]) s?.arreter()
  fauxJury?.close()
  await nettoyer()
})

const attendre = async (condition: () => boolean) => {
  for (let i = 0; i < 40 && !condition(); i++) await new Promise((r) => setTimeout(r, 100))
  expect(condition()).toBe(true)
}
const declaration = {
  presentation: 'Un minuteur.', demande: '', type_code: 'open_source', declaration_code: true, aucun_outil: true, outils_ia: [], contact_reutilisation: false,
}
async function deposer(base: string, slug: string, u: Utilisateur) {
  const url = await api(base, 'POST', `/api/campagnes/${slug}/depot/url`, u, declaration)
  expect(url.statut).toBe(200)
  const { chemin, token } = url.json as { chemin: string; token: string }
  expect((await anon().storage.from('depots').uploadToSignedUrl(chemin, token, zip())).error).toBeNull()
  return api(base, 'POST', `/api/campagnes/${slug}/depot`, u, { ...declaration, chemin })
}
async function candidatInscrit(slug: string, id: string) {
  const u = await candidat()
  expect((await u.client.rpc('sinscrire', { p_campagne_id: id })).error).toBeNull()
  return Object.assign(u, { slug })
}

describe('appel du jury après un dépôt', () => {
  it('le jury reçoit un POST avec le bon secret ; la réponse du dépôt n\'attend pas', async () => {
    const c = await campagne('depot')
    const u = await candidatInscrit(c.slug, c.id)
    recus.length = 0
    expect((await deposer(serveur.url, c.slug, u)).statut).toBe(200)
    await attendre(() => recus.length === 1)
    expect(recus[0]).toEqual({ methode: 'POST', url: '/api/jury', autorisation: `Bearer ${SECRET}` })
  })

  it('jury injoignable : le dépôt réussit quand même, et la réception est enregistrée', async () => {
    const c = await campagne('depot')
    const u = await candidatInscrit(c.slug, c.id)
    expect((await deposer(injoignable.url, c.slug, u)).statut).toBe(200)
    const { data: p } = await admin.from('participation').select('id').eq('campagne_id', c.id).single()
    expect((await admin.from('reception').select('etat').eq('participation_id', p!.id).single()).data).toEqual({ etat: 'en_attente' })
    await attendre(() => /Appel du jury \(reception\) : échec, code 0/.test(injoignable.sortie()))
  })

  it('jury non configuré : le dépôt réussit, un seul avertissement', async () => {
    const c = await campagne('depot')
    const [a, b] = [await candidatInscrit(c.slug, c.id), await candidatInscrit(c.slug, c.id)]
    expect((await deposer(sansJury.url, c.slug, a)).statut).toBe(200)
    expect((await deposer(sansJury.url, c.slug, b)).statut).toBe(200)
    await attendre(() => sansJury.sortie().includes('Jury non configuré'))
    expect(sansJury.sortie().match(/Jury non configuré/g)).toHaveLength(1)
  })
})

describe('bouton « Relancer le jury »', () => {
  const bouton = (base: string, slug: string, u?: Utilisateur, ip = ipNeuve()) => api(base, 'POST', `/api/admin/campagnes/${slug}/jury`, u, undefined, ip)

  it('refusé à un candidat et à un anonyme (404), sans appel au jury', async () => {
    const c = await campagne('depot')
    recus.length = 0
    expect((await bouton(serveur.url, c.slug, await candidat())).statut).toBe(404)
    expect((await bouton(serveur.url, c.slug)).statut).toBe(404)
    expect(recus).toHaveLength(0)
  })

  it('organisateur : lancé, déjà en cours (409 du jury), non configuré, en échec ; une campagne inconnue : 404', async () => {
    const c = await campagne('depot')
    recus.length = 0
    reponse = 202
    expect((await bouton(serveur.url, c.slug, orga)).json).toMatchObject({ etat: 'lance' })
    expect(recus.at(-1)).toMatchObject({ autorisation: `Bearer ${SECRET}` })
    reponse = 409
    expect((await bouton(serveur.url, c.slug, orga)).json).toMatchObject({ etat: 'deja_en_cours' })
    reponse = 500
    expect((await bouton(serveur.url, c.slug, orga)).json).toMatchObject({ etat: 'echec' })
    reponse = 202
    expect((await bouton(sansJury.url, c.slug, orga)).json).toMatchObject({ etat: 'non_configure' })
    expect((await bouton(injoignable.url, c.slug, orga)).json).toMatchObject({ etat: 'echec' })
    expect((await bouton(serveur.url, 'inconnue', orga)).statut).toBe(404)
  })

  it('un appel par minute et par adresse : le second répond 429 avec Retry-After', async () => {
    const c = await campagne('depot')
    const ip = ipNeuve()
    expect((await bouton(serveur.url, c.slug, orga, ip)).statut).toBe(200)
    const trop = await bouton(serveur.url, c.slug, orga, ip)
    expect(trop.statut).toBe(429)
    expect(Number(trop.retryAfter)).toBeGreaterThan(0)
    expect((await bouton(serveur.url, c.slug, orga, ipNeuve())).statut).toBe(200)
  })
})

describe('tâche quotidienne', () => {
  it('appelle le jury et met le code reçu dans son bilan', async () => {
    recus.length = 0
    reponse = 202
    const r = await fetch(`${serveur.url}/api/cron/conservation`, { headers: { authorization: `Bearer ${CRON}` } })
    expect(r.status).toBe(200)
    expect((await r.json()).jury).toEqual({ code: 202 })
    expect(recus).toHaveLength(1)
    reponse = 409
    expect((await (await fetch(`${serveur.url}/api/cron/conservation`, { headers: { authorization: `Bearer ${CRON}` } })).json()).jury).toEqual({ code: 409 })
    reponse = 202
  })
})

describe('bail d\'exclusion', () => {
  const nom = 'test-' + randomBytes(5).toString('hex')
  const prendre = async (detenteur: string, secondes = 60) => (await admin.rpc('prendre_verrou', { p_nom: nom, p_detenteur: detenteur, p_secondes: secondes })).data
  const rendre = async (detenteur: string) => (await admin.rpc('rendre_verrou', { p_nom: nom, p_detenteur: detenteur })).data
  afterAll(async () => { await admin.from('verrou').delete().eq('nom', nom) })

  it('vingt prises simultanées : une seule réussit ; rendu par un autre refusé, puis par le détenteur', async () => {
    const detenteurs = Array.from({ length: 20 }, (_, i) => `d${i}`)
    const prises = await Promise.all(detenteurs.map((d) => prendre(d)))
    expect(prises.filter(Boolean)).toHaveLength(1)
    const gagnant = detenteurs[prises.indexOf(true)]!
    const autre = detenteurs.find((d) => d !== gagnant)!
    expect(await rendre(autre)).toBe(false)
    expect(await prendre(autre)).toBe(false)
    expect(await rendre(gagnant)).toBe(true)
    expect(await prendre(autre)).toBe(true)
    expect(await rendre(autre)).toBe(true)
  })

  it('un bail expiré est repris ; l\'ancien détenteur ne rend rien', async () => {
    expect(await prendre('premier', 1)).toBe(true)
    expect(await prendre('second', 60)).toBe(false)
    await new Promise((r) => setTimeout(r, 1200))
    expect(await prendre('second', 60)).toBe(true)
    expect(await rendre('premier')).toBe(false)
    expect(await rendre('second')).toBe(true)
  })

  it('refusé à un candidat connecté et à un anonyme', async () => {
    const u = await utilisateur()
    for (const client of [u.client, anon()]) {
      expect((await client.rpc('prendre_verrou', { p_nom: nom, p_detenteur: 'x', p_secondes: 60 })).error?.code).toBe('42501')
      expect((await client.rpc('rendre_verrou', { p_nom: nom, p_detenteur: 'x' })).error?.code).toBe('42501')
    }
  })
})
