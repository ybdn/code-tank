// Mode d'accès (story 1.3) contre la pile locale et le serveur construit : /admin et /api/admin/** en 404 hors admin,
// réglage du mode, création de compte selon le mode, pseudo modifiable en liste d'attente.
// Le rôle admin est posé en SQL (AD-3), jamais par une route du site.
import { randomBytes, randomInt } from 'node:crypto'
import { request } from 'node:http'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { API, connexion, demarrer, lireCompte, nettoyer, sql, statut, utilisateur } from './aide'

type Session = Awaited<ReturnType<typeof connexion>> & { u: Awaited<ReturnType<typeof utilisateur>> }
let serveur: Awaited<ReturnType<typeof demarrer>>
let admin: Session
let membre: Session

const ipNeuve = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`
const pseudo = () => 'ada_' + randomBytes(4).toString('hex')

async function post(chemin: string, cookie: string | undefined, corps: unknown, type = 'application/json') {
  const r = await fetch(serveur.url + chemin, {
    method: 'POST',
    headers: { 'x-forwarded-for': ipNeuve(), 'content-type': type, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(corps),
  })
  return { statut: r.status, json: await r.json() as { message?: string; mode?: string } }
}
const lire = (chemin: string, cookie?: string) => fetch(serveur.url + chemin, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
const creerCompte = (cookie: string, p = pseudo()) => post('/api/compte', cookie, { pseudo: p, charte: true, majeur: true })
const regler = async (mode: string) => expect((await post('/api/admin/reglage', admin.cookie, { mode })).statut).toBe(200)
const modeCourant = async () => (await (await lire('/api/admin/reglage', admin.cookie)).json()).mode

// Requête au chemin envoyé tel quel (fetch normaliserait l'URL) : http.request.
const brut = (methode: string, chemin: string, cookie?: string) => new Promise<number>((ok, ko) => {
  const r = request(serveur.url + chemin, {
    method: methode,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ipNeuve(), ...(cookie ? { cookie } : {}) },
  }, (res) => { res.resume(); ok(res.statusCode!) })
  r.on('error', ko)
  r.end(methode === 'POST' ? JSON.stringify({ mode: 'ferme' }) : undefined)
})

// Nouvel utilisateur GitHub connecté, avec ou sans compte créé (mode courant).
async function inscrit(avecCompte = true) {
  const u = await utilisateur()
  const s = await connexion(u)
  if (avecCompte) expect((await creerCompte(s.cookie)).statut).toBe(200)
  return { ...s, u }
}

beforeAll(async () => {
  serveur = await demarrer(3913, { NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex') })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  const a = await inscrit()
  sql(`update public.compte set role = 'admin' where id = '${a.u.id}'`)
  admin = a
  membre = await inscrit()
})
// Chaque test repart du mode ouvert, même s'il échoue en cours de route.
afterEach(() => { sql('update public.reglage set mode_acces = \'ouvert\'') })
afterAll(async () => {
  serveur?.arreter()
  sql('update public.reglage set mode_acces = \'ouvert\'')
  await nettoyer()
})

describe('accès à /admin', () => {
  it.each(['/admin', '/api/admin/reglage'])('%s : 404 pour le visiteur et le membre, 200 pour l\'admin', async (chemin) => {
    expect((await lire(chemin)).status).toBe(404)
    expect((await lire(chemin, membre.cookie)).status).toBe(404)
    const r = await lire(chemin, admin.cookie)
    expect(r.status).toBe(200)
    if (chemin === '/admin') expect(await r.text()).toContain('Mode d&#39;accès')
    else expect(await r.json()).toEqual({ mode: 'ouvert' })
  })

  it.each([
    ['GET', '/api/%61dmin/reglage'],
    ['POST', '/api/%61dmin/reglage'],
    ['GET', '/api/%41DMIN/reglage'],
    ['GET', '/api/%2561dmin/reglage'],
    ['GET', '/api//admin/reglage'],
    ['GET', '/api/admin'],
    ['GET', '/ADMIN/'],
    ['GET', '/api/admin/reglage/'],
    ['GET', '/%E0'],
  ])('%s %s : 404 pour le visiteur et le membre (chemin encodé, casse, barres)', async (methode, chemin) => {
    for (const cookie of [undefined, membre.cookie]) expect(await brut(methode, chemin, cookie)).toBe(404)
    expect(await modeCourant()).toBe('ouvert')
  })

  // Témoin : la variante que le routeur décode atteint bien la route pour l'admin (le 404 ci-dessus n'est pas une route
  // absente). Le routeur respecte la casse : /api/ADMIN/reglage n'existe pour personne.
  it('/api/%61dmin/reglage : 200 pour l\'admin', async () => {
    expect(await brut('GET', '/api/%61dmin/reglage', admin.cookie)).toBe(200)
  })

  it('un compte en attente reçoit aussi 404', async () => {
    await regler('liste_attente')
    const attente = await inscrit()
    expect((await lire('/admin', attente.cookie)).status).toBe(404)
    expect((await lire('/api/admin/reglage', attente.cookie)).status).toBe(404)
  })

  it('POST /api/admin/reglage : 404 hors admin, 415 hors JSON, 409 mode inconnu, 200 pour l\'admin', async () => {
    expect((await post('/api/admin/reglage', undefined, { mode: 'ferme' })).statut).toBe(404)
    expect((await post('/api/admin/reglage', membre.cookie, { mode: 'ferme' })).statut).toBe(404)
    expect(await modeCourant()).toBe('ouvert')
    expect((await post('/api/admin/reglage', admin.cookie, { mode: 'ferme' }, 'application/x-www-form-urlencoded')).statut).toBe(415)
    expect(await post('/api/admin/reglage', admin.cookie, { mode: 'grand_ouvert' }))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Mode d\'accès inconnu.' }) })
    expect(await post('/api/admin/reglage', admin.cookie, { mode: 'ferme' })).toEqual({ statut: 200, json: { mode: 'ferme' } })
    expect(await modeCourant()).toBe('ferme')
  })

  it('un membre qui appelle regler_mode_acces par PostgREST est refusé par la fonction', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/regler_mode_acces`, {
      method: 'POST',
      headers: { apikey: statut.ANON_KEY, authorization: `Bearer ${membre.jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_mode: 'ferme' }),
    })
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ code: 'P0001', message: 'Réservé à l\'administration.' })
    expect(await modeCourant()).toBe('ouvert')
  })
})

describe('création selon le mode', () => {
  it('liste_attente : le compte naît en_attente', async () => {
    await regler('liste_attente')
    const s = await inscrit()
    expect(await lireCompte(s.jeton)).toMatchObject([{ role: 'membre', etat: 'en_attente' }])
  })

  it('ferme : création refusée en 409, les comptes existants se connectent normalement', async () => {
    await regler('ferme')
    const s = await inscrit(false)
    expect(await creerCompte(s.cookie)).toEqual({ statut: 409, json: expect.objectContaining({ message: 'Les inscriptions sont fermées pour le moment.' }) })
    expect(await lireCompte(s.jeton)).toEqual([])
    // Le membre existant rouvre une session et retrouve son compte ; l'admin garde /admin.
    expect(await lireCompte((await connexion(membre.u)).jeton)).toMatchObject([{ etat: 'actif' }])
    expect((await lire('/api/admin/reglage', admin.cookie)).status).toBe(200)
  })
})

describe('pseudo en liste d\'attente', () => {
  it('un compte en attente change son pseudo ; pseudo pris, hors JSON ou sans session refusés', async () => {
    await regler('liste_attente')
    const s = await inscrit()
    const nouveau = pseudo()
    expect(await post('/api/compte/pseudo', s.cookie, { pseudo: nouveau })).toEqual({ statut: 200, json: { ok: true } })
    expect(await lireCompte(s.jeton)).toMatchObject([{ pseudo: nouveau, etat: 'en_attente' }])
    const pris = (await lireCompte(membre.jeton))[0].pseudo as string
    expect(await post('/api/compte/pseudo', s.cookie, { pseudo: pris.toUpperCase() }))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Ce pseudo est déjà pris.' }) })
    expect((await post('/api/compte/pseudo', s.cookie, { pseudo: pseudo() }, 'text/plain')).statut).toBe(415)
    expect((await post('/api/compte/pseudo', undefined, { pseudo: pseudo() })).statut).toBe(401)
    expect(await lireCompte(s.jeton)).toMatchObject([{ pseudo: nouveau }])
  })

  it('un compte actif garde son pseudo figé', async () => {
    const avant = (await lireCompte(membre.jeton))[0].pseudo
    expect(await post('/api/compte/pseudo', membre.cookie, { pseudo: pseudo() }))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Ton pseudo ne se change plus : il est figé une fois ton compte actif.' }) })
    expect((await lireCompte(membre.jeton))[0].pseudo).toBe(avant)
  })
})
