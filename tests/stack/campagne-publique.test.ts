// Campagne publique (story 2.2) contre la pile locale et le serveur construit : l'accueil et la page d'une campagne
// publique ouverte ; 404 pour un brouillon, une campagne sur invitation hors de son Boss et un slug hors forme.
import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API, connexion, demarrer, nettoyer, sql, statut, utilisateur } from './aide'

let serveur: Awaited<ReturnType<typeof demarrer>>
const ids: string[] = []
const jour = 86_400_000
const marque = randomBytes(4).toString('hex')

async function envoyer(methode: string, chemin: string, cookie: string, corps: unknown = {}) {
  const r = await fetch(serveur.url + chemin, {
    method: methode,
    headers: { 'x-forwarded-for': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`, 'content-type': 'application/json', cookie },
    body: JSON.stringify(corps),
  })
  return { statut: r.status, json: await r.json() as { slug?: string } }
}
const lire = async (chemin: string, cookie?: string) => {
  const r = await fetch(serveur.url + chemin, { headers: cookie ? { cookie } : {} })
  return { statut: r.status, json: r.headers.get('content-type')?.includes('json') ? await r.json() : null, texte: r.headers.get('content-type')?.includes('html') ? await r.text() : '' }
}

// Compte actif connecté, Boss d'une campagne créée (et ouverte si demandé).
async function boss(titre: string, visibilite: 'publique' | 'invitation', ouvrir: boolean) {
  const u = await utilisateur()
  const s = await connexion(u)
  const pseudo = 'ada_' + randomBytes(4).toString('hex')
  expect((await envoyer('POST', '/api/compte', s.cookie, { pseudo, charte: true, majeur: true })).statut).toBe(200)
  ids.push(u.id)
  const r = await envoyer('POST', '/api/boss', s.cookie, {
    titre, theme: 'Un minuteur', brief: 'Écris un minuteur de pause.', langages: ['TypeScript', 'Go'], visibilite, role_boss: 'juge', max_participants: 5,
    ouverture_inscriptions: new Date(Date.now() + jour).toISOString(),
    cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
    date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
  })
  expect(r.statut).toBe(200)
  const slug = r.json.slug!
  if (ouvrir) expect((await envoyer('POST', `/api/boss/${slug}/ouverture`, s.cookie)).statut).toBe(200)
  return { ...s, pseudo, slug, titre }
}

let pub: Awaited<ReturnType<typeof boss>>
let inv: Awaited<ReturnType<typeof boss>>
let brouillon: Awaited<ReturnType<typeof boss>>

beforeAll(async () => {
  serveur = await demarrer(3915, { NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex') })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  pub = await boss(`Publique ${marque}`, 'publique', true)
  inv = await boss(`Invitation ${marque}`, 'invitation', true)
  brouillon = await boss(`Brouillon ${marque}`, 'publique', false)
})
afterAll(async () => {
  serveur?.arreter()
  if (ids.length) sql(`delete from public.campagne where boss_id in (${ids.map((i) => `'${i}'`).join(', ')})`)
  await nettoyer()
})

describe('campagne publique', () => {
  it('l\'accueil liste la campagne publique ouverte, ni l\'invitation ni le brouillon', async () => {
    const liste = (await lire('/api/campagnes')).json as { slug: string }[]
    expect(liste).toContainEqual({ slug: pub.slug, titre: pub.titre, theme: 'Un minuteur', phase: 'a_venir', max_participants: 5 })
    expect(liste.map((c) => c.slug)).not.toContain(inv.slug)
    expect(liste.map((c) => c.slug)).not.toContain(brouillon.slug)
    const accueil = await lire('/')
    expect(accueil.texte).toContain(pub.titre)
    expect(accueil.texte).toContain(`/campagnes/${pub.slug}`)
    expect(accueil.texte).toContain('Inscriptions à venir')
    expect(accueil.texte).not.toContain(inv.titre)
    expect(accueil.texte).not.toContain(brouillon.titre)
  })

  it('la page publique montre règles, critères et poids, et le poids du Boss juge', async () => {
    const r = await lire(`/api/campagnes/${pub.slug}`)
    expect(r).toMatchObject({ statut: 200, json: { slug: pub.slug, brief: 'Écris un minuteur de pause.', langages: ['TypeScript', 'Go'], max_participants: 5, role_boss: 'juge', phase: 'a_venir', boss_pseudo: pub.pseudo } })
    expect(r.json).not.toHaveProperty('boss_id')
    expect(r.json.criteres).toHaveLength(8)
    expect(r.json.criteres).toContainEqual({ cle: 'outillage_doc', libelle: 'Outillage et doc : README, lint, CI, instructions de lancement', jure: 'lint', poids: 10, calcule: true })
    const page = await lire(`/campagnes/${pub.slug}`)
    expect(page.statut).toBe(200)
    expect(page.texte).toContain('Écris un minuteur de pause.')
    expect(page.texte).toContain('Le Boss vote\u00a0: 33\u00a0% du score final')
    expect(page.texte).toContain('Sécurité')
    // Côté Boss : son poids et le lien vers la page publique ; plus de bouton d'ouverture.
    const cote = await lire(`/boss/${pub.slug}`, pub.cookie)
    expect(cote.texte).toContain('ton vote compte pour 33\u00a0% du score final')
    expect(cote.texte).toContain(`href="/campagnes/${pub.slug}"`)
    expect(cote.texte).not.toContain('Ouvrir la campagne</button>')
    expect((await lire(`/boss/${brouillon.slug}`, brouillon.cookie)).texte).toContain('Ouvrir la campagne</button>')
  })

  it('invitation : 404 hors de son Boss (accueil, page, API), visible de son Boss', async () => {
    for (const cookie of [undefined, pub.cookie]) {
      expect((await lire(`/api/campagnes/${inv.slug}`, cookie)).statut).toBe(404)
      expect((await lire(`/campagnes/${inv.slug}`, cookie)).statut).toBe(404)
    }
    expect(await lire(`/api/campagnes/${inv.slug}`, inv.cookie)).toMatchObject({ statut: 200, json: { slug: inv.slug, visibilite: 'invitation' } })
    expect((await lire(`/campagnes/${inv.slug}`, inv.cookie)).statut).toBe(200)
    // Appel direct de PostgREST par le visiteur : la vue ne rend rien.
    const direct = await fetch(`${API}/rest/v1/campagne_phase?slug=eq.${inv.slug}`, { headers: { apikey: statut.ANON_KEY } })
    expect(await direct.json()).toEqual([])
  })

  it('brouillon : 404 pour tous, son Boss compris (il le voit par /boss)', async () => {
    for (const cookie of [undefined, pub.cookie, brouillon.cookie]) {
      expect((await lire(`/api/campagnes/${brouillon.slug}`, cookie)).statut).toBe(404)
      expect((await lire(`/campagnes/${brouillon.slug}`, cookie)).statut).toBe(404)
    }
    expect((await lire(`/api/boss/${brouillon.slug}`, brouillon.cookie)).statut).toBe(200)
  })

  it('slug hors forme ou inconnu : 404, jamais 500', async () => {
    for (const chemin of ['/api/campagnes/%00', '/api/campagnes/%ED%A0%80', '/campagnes/%00', `/api/campagnes/inconnue-${marque}`]) {
      expect((await lire(chemin)).statut, chemin).toBe(404)
    }
  })
})
