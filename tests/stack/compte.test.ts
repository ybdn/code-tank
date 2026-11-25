// Création du compte par GitHub (story 1.2) contre la pile locale et le serveur construit.
// Utilisateurs de test : voir aide.ts.
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { VERSION_CHARTE } from '../../shared/utils/compte'
import { API, connexion, demarrer, lireCompte, nettoyer, statut, utilisateur } from './aide'

const ipNeuve = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`
let serveur: Awaited<ReturnType<typeof demarrer>>

async function creer(cookie: string | undefined, corps: Record<string, unknown>, ip = ipNeuve(), type = 'application/json') {
  const r = await fetch(serveur.url + '/api/compte', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'content-type': type, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(corps),
  })
  return { statut: r.status, json: await r.json() as { message?: string } }
}
const pseudo = () => 'ada_' + randomBytes(4).toString('hex')
const formulaire = (surcharge: Record<string, unknown> = {}) => ({ pseudo: pseudo(), charte: true, majeur: true, ...surcharge })

beforeAll(async () => (serveur = await demarrer(3912, { NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex') })))
afterAll(async () => {
  serveur?.arreter()
  await nettoyer()
})

describe('création du compte', () => {
  it('crée le compte : github_id de l\'identité, version de charte du serveur, membre actif ; ignore le reste du corps', async () => {
    const u = await utilisateur()
    const { cookie, jeton } = await connexion(u)
    const f = formulaire({ github_id: '424242', role: 'admin', etat: 'suspendu', version_charte: '1999-01-01', id: randomUUID() })
    expect((await creer(cookie, f)).statut).toBe(200)
    expect(await lireCompte(jeton)).toEqual([{ id: u.id, github_id: u.githubId, pseudo: f.pseudo, version_charte: VERSION_CHARTE, role: 'membre', etat: 'actif' }])
  })

  it('la même identité qui se reconnecte retrouve son compte, sans en créer un second', async () => {
    const u = await utilisateur()
    const f = formulaire()
    expect((await creer((await connexion(u)).cookie, f)).statut).toBe(200)
    const nouvelle = await connexion(u)
    expect(await lireCompte(nouvelle.jeton)).toMatchObject([{ id: u.id, pseudo: f.pseudo }])
    expect(await creer(nouvelle.cookie, formulaire())).toEqual({ statut: 409, json: expect.objectContaining({ message: 'Tu as déjà un compte.' }) })
    expect(await lireCompte(nouvelle.jeton)).toHaveLength(1)
  })

  it.each([
    [{ charte: false }, 'Accepte la charte pour créer ton compte.'],
    [{ majeur: false }, 'Il faut avoir 18 ans ou plus.'],
    [{ charte: 'true' }, 'Accepte la charte pour créer ton compte.'],
  ])('refuse %o en 409 avec un message clair', async (surcharge, message) => {
    const u = await utilisateur()
    const { cookie, jeton } = await connexion(u)
    expect(await creer(cookie, formulaire(surcharge))).toEqual({ statut: 409, json: expect.objectContaining({ message }) })
    expect(await lireCompte(jeton)).toEqual([])
  })

  it('refuse un pseudo pris, sans tenir compte de la casse', async () => {
    const p = pseudo()
    expect((await creer((await connexion(await utilisateur())).cookie, formulaire({ pseudo: p }))).statut).toBe(200)
    const r = await creer((await connexion(await utilisateur())).cookie, formulaire({ pseudo: p.toUpperCase() }))
    expect(r).toEqual({ statut: 409, json: expect.objectContaining({ message: 'Ce pseudo est déjà pris.' }) })
  })

  it('un inscrit ne peut pas appeler creer_compte directement par PostgREST (ni limite ni version contournées)', async () => {
    const u = await utilisateur()
    const { jeton } = await connexion(u)
    const r = await fetch(`${API}/rest/v1/rpc/creer_compte`, {
      method: 'POST',
      headers: { apikey: statut.ANON_KEY, authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_compte: u.id, p_pseudo: pseudo(), p_version_charte: '1999-01-01', p_charte_acceptee: true, p_majeur: true }),
    })
    // Refus de droit (permission denied), pas une autre erreur.
    expect(r.status).toBe(403)
    expect(await r.json()).toMatchObject({ code: '42501' })
    expect(await lireCompte(jeton)).toEqual([])
  })

  it('refuse sans session (401) et sans identité GitHub (409)', async () => {
    expect((await creer(undefined, formulaire())).statut).toBe(401)
    const r = await creer((await connexion(await utilisateur(false))).cookie, formulaire())
    expect(r).toEqual({ statut: 409, json: expect.objectContaining({ message: 'Seule la connexion GitHub permet de créer un compte.' }) })
  })

  it('refuse en 415 un corps qui n\'est pas du JSON (formulaire d\'un autre site)', async () => {
    const u = await utilisateur()
    const { cookie, jeton } = await connexion(u)
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
      expect(await creer(cookie, formulaire(), ipNeuve(), type)).toEqual({ statut: 415, json: expect.objectContaining({ message: 'Envoie le formulaire au format JSON.' }) })
    }
    expect(await lireCompte(jeton)).toEqual([])
  })

  it('limite la création de compte par adresse IP', async () => {
    const { cookie } = await connexion(await utilisateur())
    const ip = ipNeuve()
    // Plafond de 5 : les essais refusés comptent aussi.
    for (let i = 0; i < 5; i++) expect((await creer(cookie, formulaire({ charte: false }), ip)).statut).toBe(409)
    expect((await creer(cookie, formulaire(), ip)).statut).toBe(429)
  })
})
