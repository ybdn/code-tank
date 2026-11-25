// Invitation (story 2.4) contre la pile locale et le serveur construit : le Boss lit et régénère le lien, un compte l'ouvre
// et s'inscrit, puis voit la campagne par son adresse sans le lien ; ancien lien en 404, inscrits gardent l'accès ; refus
// (401, 404, 409, 415) ; le jeton n'apparaît ni sur l'accueil ni sur la page publique.
import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connexion, demarrer, nettoyer, sql, utilisateur } from './aide'

let serveur: Awaited<ReturnType<typeof demarrer>>
const ids: string[] = []
const jour = 86_400_000
const marque = randomBytes(4).toString('hex')

async function envoyer(methode: string, chemin: string, cookie: string, corps: unknown = {}, type = 'application/json') {
  const r = await fetch(serveur.url + chemin, {
    method: methode,
    headers: { 'x-forwarded-for': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`, 'content-type': type, cookie },
    body: JSON.stringify(corps),
  })
  return { statut: r.status, json: await r.json() as { slug?: string; message?: string; jeton_invitation?: string } }
}
const lire = async (chemin: string, cookie?: string) => {
  const r = await fetch(serveur.url + chemin, { headers: cookie ? { cookie } : {} })
  const texte = await r.text()
  return { statut: r.status, texte, json: r.headers.get('content-type')?.includes('json') ? JSON.parse(texte) : null }
}

async function membre() {
  const u = await utilisateur()
  const s = await connexion(u)
  const pseudo = 'ada_' + randomBytes(4).toString('hex')
  expect((await envoyer('POST', '/api/compte', s.cookie, { pseudo, charte: true, majeur: true })).statut).toBe(200)
  ids.push(u.id)
  return { ...s, u, pseudo }
}

// Boss joueur d'une campagne ouverte, en phase d'inscription.
async function boss(visibilite: 'publique' | 'invitation') {
  const m = await membre()
  const r = await envoyer('POST', '/api/boss', m.cookie, {
    titre: `Invitation ${visibilite} ${marque}`, theme: 'Un minuteur', brief: 'Écris un minuteur de pause.', langages: ['Go'], visibilite,
    role_boss: 'joueur', max_participants: 3,
    ouverture_inscriptions: new Date(Date.now() - 60_000).toISOString(),
    cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
    date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
  })
  expect(r.statut).toBe(200)
  const slug = r.json.slug!
  expect((await envoyer('POST', `/api/boss/${slug}/ouverture`, m.cookie)).statut).toBe(200)
  return { ...m, slug }
}

const jetonDe = async (b: { slug: string; cookie: string }) => (await lire(`/api/boss/${b.slug}`, b.cookie)).json.jeton_invitation as string

let inv: Awaited<ReturnType<typeof boss>>
let pub: Awaited<ReturnType<typeof boss>>

beforeAll(async () => {
  serveur = await demarrer(3917, { NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex') })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  inv = await boss('invitation')
  pub = await boss('publique')
})
afterAll(async () => {
  serveur?.arreter()
  if (ids.length) sql(`delete from public.campagne where boss_id in (${ids.map((i) => `'${i}'`).join(', ')})`)
  await nettoyer()
})

describe('invitation', () => {
  it('parcours : lien du Boss, inscription par le lien, accès sans le lien, régénération, ancien lien 404', async () => {
    const jeton = await jetonDe(inv)
    expect(jeton).toMatch(/^[0-9a-f]{64}$/)
    const espace = (await lire(`/boss/${inv.slug}`, inv.cookie)).texte
    expect(espace).toContain(`value="${serveur.url}/invitation/${jeton}"`)
    expect(espace).toContain('Copier</button>')
    expect(espace).toContain('Régénérer le lien</button>')
    expect(espace).toContain('l&#39;ancien n&#39;ouvrira plus rien')

    const a = await membre()
    expect((await lire(`/api/campagnes/${inv.slug}`, a.cookie)).statut).toBe(404)
    const ouverte = await lire(`/api/invitation/${jeton}`, a.cookie)
    expect(ouverte).toMatchObject({ statut: 200, json: { slug: inv.slug, visibilite: 'invitation', inscrit: false, compte_actif: true, places_restantes: 3 } })
    expect(ouverte.texte).not.toContain(jeton)
    expect(ouverte.json).not.toHaveProperty('id')
    let page = (await lire(`/invitation/${jeton}`, a.cookie)).texte
    expect(page).toContain('S&#39;inscrire</button>')
    expect(page).not.toContain('Cette campagne se rejoint sur invitation.')
    expect(page).toContain('name="robots" content="noindex"')

    const chemin = `/api/campagnes/${inv.slug}/inscription`
    expect((await envoyer('POST', chemin, a.cookie, { connaissance: true })).statut).toBe(404)
    expect((await envoyer('POST', chemin, a.cookie, { connaissance: true, jeton: '0'.repeat(64) })).statut).toBe(404)
    expect((await envoyer('POST', chemin, a.cookie, { connaissance: false, jeton })).statut).toBe(409)
    expect((await envoyer('POST', chemin, a.cookie, { connaissance: true, jeton })).statut).toBe(200)
    // Le jeton d'une campagne ne vaut pas pour une autre adresse.
    expect((await envoyer('POST', `/api/campagnes/${pub.slug}/inscription`, a.cookie, { connaissance: true, jeton })).statut).toBe(404)

    // Inscrit : la campagne par son adresse, sans le lien.
    const publique = await lire(`/api/campagnes/${inv.slug}`, a.cookie)
    expect(publique).toMatchObject({ statut: 200, json: { inscrit: true, places_restantes: 2 } })
    expect(publique.texte).not.toContain(jeton)
    page = (await lire(`/campagnes/${inv.slug}`, a.cookie)).texte
    expect(page).toContain('Tu es inscrit.')
    expect(page).not.toContain(jeton)

    // Régénération : nouveau jeton, ancien lien en 404 partout, l'inscrit garde l'accès.
    const r = await envoyer('POST', `/api/boss/${inv.slug}/invitation`, inv.cookie)
    expect(r.statut).toBe(200)
    const nouveau = r.json.jeton_invitation!
    expect(nouveau).toMatch(/^[0-9a-f]{64}$/)
    expect(nouveau).not.toBe(jeton)
    expect(await jetonDe(inv)).toBe(nouveau)
    const b = await membre()
    expect((await lire(`/api/invitation/${jeton}`, b.cookie)).statut).toBe(404)
    expect((await lire(`/invitation/${jeton}`, b.cookie)).statut).toBe(404)
    expect((await envoyer('POST', chemin, b.cookie, { connaissance: true, jeton })).statut).toBe(404)
    expect((await lire(`/api/campagnes/${inv.slug}`, a.cookie)).json).toMatchObject({ inscrit: true })
    expect((await lire(`/api/invitation/${nouveau}`, b.cookie)).statut).toBe(200)
    expect((await envoyer('POST', chemin, b.cookie, { connaissance: true, jeton: nouveau })).statut).toBe(200)

    // Désinscrit, l'ancien inscrit ne voit plus la campagne.
    expect((await envoyer('DELETE', chemin, a.cookie)).statut).toBe(200)
    expect((await lire(`/api/campagnes/${inv.slug}`, a.cookie)).statut).toBe(404)

    // Ni l'accueil ni la liste ne montrent la campagne ou un jeton.
    for (const p of ['/', '/api/campagnes']) {
      const t = (await lire(p)).texte
      expect(t).not.toContain(inv.slug)
      expect(t).not.toContain(nouveau)
    }
  })

  it('le Boss joueur s\'inscrit à sa campagne sur invitation depuis son adresse, sans le lien', async () => {
    expect((await lire(`/campagnes/${inv.slug}`, inv.cookie)).texte).toContain('S&#39;inscrire</button>')
    expect((await envoyer('POST', `/api/campagnes/${inv.slug}/inscription`, inv.cookie, { connaissance: true })).statut).toBe(200)
    expect((await envoyer('DELETE', `/api/campagnes/${inv.slug}/inscription`, inv.cookie)).statut).toBe(200)
  })

  it('refus : 401 sans session, 404 hors forme, 409 sur une publique, 415, 404 hors du Boss', async () => {
    const jeton = await jetonDe(inv)
    const a = await membre()
    expect((await lire(`/api/invitation/${jeton}`)).statut).toBe(401)
    const page = await lire(`/invitation/${jeton}`)
    expect(page.statut).toBe(200)
    expect(page.texte).toContain('Connecte-toi avec GitHub pour voir cette campagne et t&#39;y inscrire, puis rouvre ce lien.')
    expect(page.texte).not.toContain(inv.slug)
    // Le lien ne fuit pas vers un autre site par l'en-tête Referer.
    expect((await fetch(`${serveur.url}/invitation/${jeton}`)).headers.get('referrer-policy')).toBe('no-referrer')
    for (const j of ['abc', jeton.toUpperCase(), 'g'.repeat(64), '%00', `${jeton.slice(0, 63)}%00`, '%ED%A0%80', `${jeton}0`]) {
      expect((await lire(`/api/invitation/${j}`, a.cookie)).statut, j).toBe(404)
    }
    expect((await lire('/api/invitation/%00')).statut).toBe(404)
    const chemin = `/api/campagnes/${inv.slug}/inscription`
    for (const j of ['abc', '\u0000', 42, jeton.toUpperCase()]) {
      expect((await envoyer('POST', chemin, a.cookie, { connaissance: true, jeton: j })).statut, String(j)).toBe(404)
    }

    expect(await envoyer('POST', `/api/boss/${pub.slug}/invitation`, pub.cookie))
      .toMatchObject({ statut: 409, json: { message: 'Seule une campagne sur invitation a un lien.' } })
    expect(await jetonDe(pub)).toBeNull()
    expect((await lire(`/boss/${pub.slug}`, pub.cookie)).texte).not.toContain('Lien d&#39;invitation')
    expect((await envoyer('POST', `/api/boss/${inv.slug}/invitation`, inv.cookie, {}, 'text/plain')).statut).toBe(415)
    expect((await envoyer('POST', `/api/boss/${inv.slug}/invitation`, a.cookie)).statut).toBe(404)
    expect((await envoyer('POST', `/api/boss/${inv.slug}/invitation`, '')).statut).toBe(404)
    expect(await jetonDe(inv)).toBe(jeton)
  })

  it('Boss suspendu : le lien reste lisible, la régénération n\'est pas proposée', async () => {
    const b = await boss('invitation')
    sql(`update public.compte set etat = 'suspendu' where id = '${b.u.id}'`)
    const espace = (await lire(`/boss/${b.slug}`, b.cookie)).texte
    expect(espace).toContain(`/invitation/${await jetonDe(b)}`)
    expect(espace).not.toContain('Régénérer le lien</button>')
    expect(espace).toContain('Le lien ne se régénère plus')
    expect(await envoyer('POST', `/api/boss/${b.slug}/invitation`, b.cookie)).toMatchObject({ statut: 409, json: { message: 'Ton compte n\'est pas actif.' } })
  })
})
