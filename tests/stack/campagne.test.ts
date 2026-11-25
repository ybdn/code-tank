// Campagnes du Boss (story 2.1) contre la pile locale et le serveur construit : création, réglage et suppression d'un
// brouillon, 404 pour tout autre compte sur /api/boss/[slug] et /boss/[slug], 409 pour les règles métier, 415 hors JSON.
// Les étapes postérieures au brouillon (ouverte, règles figées) sont posées en SQL : leurs RPC arrivent avec d'autres stories.
import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API, connexion, demarrer, nettoyer, sql, statut, utilisateur } from './aide'

type Session = Awaited<ReturnType<typeof connexion>> & { u: Awaited<ReturnType<typeof utilisateur>> }
let serveur: Awaited<ReturnType<typeof demarrer>>
let boss: Session
let autre: Session
const ids: string[] = []

const jour = 86_400_000
const reglages = (titre = 'Minuteur de pause') => ({
  titre, theme: 'Un minuteur', brief: 'Écris un minuteur de pause.', langages: ['TypeScript', 'Go'], visibilite: 'publique', role_boss: 'juge',
  max_participants: 5,
  ouverture_inscriptions: new Date(Date.now() + jour).toISOString(),
  cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
  date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
})

async function envoyer(methode: string, chemin: string, cookie: string | undefined, corps: unknown = {}, type = 'application/json') {
  const r = await fetch(serveur.url + chemin, {
    method: methode,
    headers: { 'x-forwarded-for': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`, 'content-type': type, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(corps),
  })
  return { statut: r.status, json: await r.json() as { message?: string; slug?: string; titre?: string; statut?: string } }
}
const lire = async (chemin: string, cookie?: string) => {
  const r = await fetch(serveur.url + chemin, { headers: cookie ? { cookie } : {} })
  return { statut: r.status, json: r.headers.get('content-type')?.includes('json') ? await r.json() : null }
}

// Nouvel utilisateur GitHub connecté avec un compte créé dans le mode courant.
async function inscrit() {
  const u = await utilisateur()
  const s = await connexion(u)
  expect((await envoyer('POST', '/api/compte', s.cookie, { pseudo: 'ada_' + randomBytes(4).toString('hex'), charte: true, majeur: true })).statut).toBe(200)
  ids.push(u.id)
  return { ...s, u }
}
const creer = async (s: Session) => {
  const r = await envoyer('POST', '/api/boss', s.cookie, reglages())
  expect(r.statut).toBe(200)
  return r.json.slug!
}

beforeAll(async () => {
  serveur = await demarrer(3914, { NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex') })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  boss = await inscrit()
  autre = await inscrit()
})
afterAll(async () => {
  serveur?.arreter()
  sql('update public.reglage set mode_acces = \'ouvert\'')
  // Les campagnes retiennent le compte du Boss : elles partent avant les utilisateurs.
  if (ids.length) sql(`delete from public.campagne where boss_id in (${ids.map((i) => `'${i}'`).join(', ')})`)
  await nettoyer()
})

describe('campagne du Boss', () => {
  it('création, 409 pour une seconde, 404 pour tout autre compte, réglage, règles figées, suppression refusée hors brouillon', async () => {
    expect((await envoyer('POST', '/api/boss', boss.cookie, reglages(), 'text/plain')).statut).toBe(415)
    expect((await envoyer('POST', '/api/boss', undefined, reglages())).statut).toBe(401)
    expect((await lire('/api/boss')).statut).toBe(401)
    const slug = await creer(boss)
    expect(slug).toMatch(/^minuteur-de-pause-[0-9a-f]{6}$/)
    expect(await lire(`/api/boss/${slug}`, boss.cookie)).toMatchObject({ statut: 200, json: { slug, statut: 'brouillon', max_participants: 5, compte_actif: true } })
    expect((await lire('/api/boss', boss.cookie)).json).toMatchObject({ campagnes: [{ slug, statut: 'brouillon' }] })
    expect((await fetch(`${serveur.url}/boss/${slug}`, { headers: { cookie: boss.cookie } })).status).toBe(200)

    expect(await envoyer('POST', '/api/boss', boss.cookie, reglages('Deuxième')))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Tu as déjà une campagne en cours : une seule à la fois.' }) })

    // Autre compte et visiteur : 404 sur chaque route [slug] et sur la page, sans effet.
    for (const cookie of [autre.cookie, undefined]) {
      expect((await lire(`/api/boss/${slug}`, cookie)).statut).toBe(404)
      expect((await envoyer('PATCH', `/api/boss/${slug}`, cookie, reglages('Pris'))).statut).toBe(404)
      expect((await envoyer('DELETE', `/api/boss/${slug}`, cookie)).statut).toBe(404)
      expect((await fetch(`${serveur.url}/boss/${slug}`, { headers: cookie ? { cookie } : {} })).status).toBe(404)
    }
    // Appel direct de la RPC par PostgREST : la fonction répond « introuvable » elle aussi.
    const id = (await lire(`/api/boss/${slug}`, boss.cookie)).json.id
    const direct = await fetch(`${API}/rest/v1/rpc/supprimer_brouillon`, {
      method: 'POST', headers: { apikey: statut.ANON_KEY, authorization: `Bearer ${autre.jeton}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_campagne: id }),
    })
    expect(await direct.json()).toMatchObject({ code: 'CT404', message: 'Campagne introuvable.' })
    expect((await lire(`/api/boss/${slug}`, boss.cookie)).statut).toBe(200)

    expect((await envoyer('PATCH', `/api/boss/${slug}`, boss.cookie, reglages('Nouveau'), 'text/plain')).statut).toBe(415)
    expect((await envoyer('PATCH', `/api/boss/${slug}`, boss.cookie, { ...reglages(), max_participants: 11 })))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Le nombre de places va de 1 à 10.' }) })
    expect(await envoyer('PATCH', `/api/boss/${slug}`, boss.cookie, reglages('Nouveau titre'))).toEqual({ statut: 200, json: { slug } })
    expect((await lire(`/api/boss/${slug}`, boss.cookie)).json).toMatchObject({ slug, titre: 'Nouveau titre' })

    sql(`update public.campagne set statut = 'ouverte' where slug = '${slug}'`)
    expect(await envoyer('DELETE', `/api/boss/${slug}`, boss.cookie))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Seul un brouillon se supprime.' }) })
    sql(`update public.campagne set regles_figees_le = now() where slug = '${slug}'`)
    expect(await envoyer('PATCH', `/api/boss/${slug}`, boss.cookie, reglages('Trop tard')))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Les règles sont figées : la campagne ne se modifie plus.' }) })
    expect((await lire(`/api/boss/${slug}`, boss.cookie)).json).toMatchObject({ titre: 'Nouveau titre' })
  })

  it('le Boss supprime son brouillon ; 415 hors JSON', async () => {
    const slug = await creer(autre)
    expect((await envoyer('DELETE', `/api/boss/${slug}`, autre.cookie, {}, 'text/plain')).statut).toBe(415)
    expect(await envoyer('DELETE', `/api/boss/${slug}`, autre.cookie)).toEqual({ statut: 200, json: { ok: true } })
    expect((await lire(`/api/boss/${slug}`, autre.cookie)).statut).toBe(404)
    // Plus de campagne active : il peut en créer une autre.
    await creer(autre)
  })

  it('deux créations simultanées du même compte : une seule passe (index unique partiel)', async () => {
    const s = await inscrit()
    const r = await Promise.all([envoyer('POST', '/api/boss', s.cookie, reglages('Un')), envoyer('POST', '/api/boss', s.cookie, reglages('Deux'))])
    expect(r.map((x) => x.statut).sort()).toEqual([200, 409])
    expect(r.find((x) => x.statut === 409)!.json.message).toBe('Tu as déjà une campagne en cours : une seule à la fois.')
    expect((await lire('/api/boss', s.cookie)).json.campagnes).toHaveLength(1)
  })

  it('valeurs hors bornes de type : 409 avec le message de la base, jamais 500', async () => {
    const s = await inscrit()
    expect(await envoyer('POST', '/api/boss', s.cookie, { ...reglages(), max_participants: 3_000_000_000 }))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Le nombre de places va de 1 à 10.' }) })
    // Caractère nul et demi-paire UTF-16 : retirés ou remplacés par la route, jamais un 500.
    expect(await envoyer('POST', '/api/boss', s.cookie, { ...reglages(), titre: '\u0000' }))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Le titre fait 1 à 120 caractères.' }) })
    expect((await envoyer('POST', '/api/boss', s.cookie, { ...reglages('Nul\u0000 et \ud83d') })).statut).toBe(200)
    expect(await envoyer('POST', '/api/boss', s.cookie, { ...reglages(), date_resultats: '+275760-09-13T00:00:00.000Z' }))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Les trois dates sont obligatoires, entre 2000 et 2100.' }) })
    expect(await envoyer('POST', '/api/boss', s.cookie, { ...reglages(), ouverture_inscriptions: '1900-01-01T00:00:00.000Z' }))
      .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Les trois dates sont obligatoires, entre 2000 et 2100.' }) })
  })

  it('un compte en attente ne crée pas de campagne', async () => {
    sql('update public.reglage set mode_acces = \'liste_attente\'')
    try {
      const attente = await inscrit()
      expect(await envoyer('POST', '/api/boss', attente.cookie, reglages()))
        .toEqual({ statut: 409, json: expect.objectContaining({ message: 'Seul un compte actif crée une campagne.' }) })
      expect((await lire('/api/boss', attente.cookie)).json).toEqual({ etat: 'en_attente', campagnes: [] })
    } finally {
      sql('update public.reglage set mode_acces = \'ouvert\'')
    }
  })
})
