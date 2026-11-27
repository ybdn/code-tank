// Inscription et désinscription (story 2.3) contre la pile locale et le serveur construit : routes, page, places restantes
// sur l'accueil et la page, refus (415, 401, 404, 409, 429) et concurrence (jamais plus d'inscrits que de places).
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
  return { statut: r.status, json: await r.json() as { slug?: string; message?: string } }
}
const lire = async (chemin: string, cookie?: string) => {
  const r = await fetch(serveur.url + chemin, { headers: cookie ? { cookie } : {} })
  return { statut: r.status, json: r.headers.get('content-type')?.includes('json') ? await r.json() : null, texte: r.headers.get('content-type')?.includes('html') ? await r.text() : '' }
}

// Compte actif connecté.
async function membre() {
  const u = await utilisateur()
  const s = await connexion(u)
  const pseudo = 'ada_' + randomBytes(4).toString('hex')
  expect((await envoyer('POST', '/api/compte', s.cookie, { pseudo, charte: true, majeur: true })).statut).toBe(200)
  ids.push(u.id)
  return { ...s, u, pseudo }
}

// Boss d'une campagne publique ouverte, en phase d'inscription.
async function boss(role_boss: 'juge' | 'joueur', max_participants: number) {
  const m = await membre()
  const titre = `Inscription ${role_boss} ${marque}`
  const r = await envoyer('POST', '/api/boss', m.cookie, {
    titre, theme: 'Un minuteur', brief: 'Écris un minuteur de pause.', langages: ['Go'], visibilite: 'publique', role_boss, max_participants,
    ouverture_inscriptions: new Date(Date.now() - 60_000).toISOString(),
    cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
    date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
  })
  expect(r.statut).toBe(200)
  const slug = r.json.slug!
  expect((await envoyer('POST', `/api/boss/${slug}/ouverture`, m.cookie)).statut).toBe(200)
  return { ...m, slug, titre }
}

const inscrits = (slug: string) =>
  Number(/^\s*(\d+)\s*$/m.exec(sql(`select count(*) from public.participation p join public.campagne c on c.id = p.campagne_id where c.slug = '${slug}' and p.etat = 'inscrit'`).toString())![1])

let juge: Awaited<ReturnType<typeof boss>>
let joueur: Awaited<ReturnType<typeof boss>>

beforeAll(async () => {
  serveur = await demarrer(3916, { NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex') })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  juge = await boss('juge', 3)
  joueur = await boss('joueur', 2)
})
afterAll(async () => {
  serveur?.arreter()
  if (ids.length) sql(`delete from public.campagne where boss_id in (${ids.map((i) => `'${i}'`).join(', ')})`)
  await nettoyer()
})

describe('inscription', () => {
  it('un compte actif s\'inscrit puis se désinscrit ; places restantes sur l\'accueil et la page', async () => {
    const a = await membre()
    const chemin = `/api/campagnes/${juge.slug}/inscription`
    let page = (await lire(`/campagnes/${juge.slug}`, a.cookie)).texte
    expect(page).toContain('Ton code sera envoyé à Anthropic avec la clé API du Boss de la campagne, pour que ses agents le notent.')
    expect(page).toContain('S&#39;inscrire</button>')
    expect(page).toContain('3 sur 3')

    expect(await envoyer('POST', chemin, a.cookie, { connaissance: false })).toMatchObject({ statut: 409, json: { message: 'Coche la case : ton code sera envoyé à Anthropic.' } })
    expect(await envoyer('POST', chemin, a.cookie, {})).toMatchObject({ statut: 409 })
    expect((await envoyer('POST', chemin, a.cookie, { connaissance: true })).statut).toBe(200)
    expect(await envoyer('POST', chemin, a.cookie, { connaissance: true })).toMatchObject({ statut: 409, json: { message: 'Tu es déjà inscrit.' } })

    expect((await lire(`/api/campagnes/${juge.slug}`, a.cookie)).json).toMatchObject({ inscrit: true, places_restantes: 2, compte_actif: true, est_boss: false })
    expect((await lire(`/api/campagnes/${juge.slug}`)).json).toMatchObject({ inscrit: false, connecte: false, places_restantes: 2 })
    expect((await lire(`/api/campagnes/${juge.slug}`)).json).not.toHaveProperty('id')
    page = (await lire(`/campagnes/${juge.slug}`, a.cookie)).texte
    expect(page).toContain('Tu es inscrit.')
    expect(page).toContain('Me désinscrire</button>')
    expect(page).toContain('2 sur 3')
    const liste = (await lire('/api/campagnes')).json as { slug: string; places_restantes: number }[]
    expect(liste.find((c) => c.slug === juge.slug)).toMatchObject({ places_restantes: 2, max_participants: 3 })
    expect((await lire('/')).texte).toContain('2 places restantes sur 3')

    expect((await envoyer('DELETE', chemin, a.cookie)).statut).toBe(200)
    expect(await envoyer('DELETE', chemin, a.cookie)).toMatchObject({ statut: 409, json: { message: 'Tu n\'es pas inscrit à cette campagne.' } })
    expect((await lire(`/api/campagnes/${juge.slug}`, a.cookie)).json).toMatchObject({ inscrit: false, places_restantes: 3 })
  })

  it('refus d\'entrée : 415, 401, slug hors forme ou inconnu 404, jamais 500', async () => {
    const a = await membre()
    const chemin = `/api/campagnes/${juge.slug}/inscription`
    expect((await envoyer('POST', chemin, a.cookie, { connaissance: true }, 'text/plain')).statut).toBe(415)
    expect((await envoyer('DELETE', chemin, a.cookie, {}, 'text/plain')).statut).toBe(415)
    expect((await envoyer('POST', chemin, '', { connaissance: true })).statut).toBe(401)
    expect((await envoyer('DELETE', chemin, '')).statut).toBe(401)
    for (const slug of ['%00', '%ED%A0%80', `inconnue-${marque}`]) {
      expect((await envoyer('POST', `/api/campagnes/${slug}/inscription`, a.cookie, { connaissance: true })).statut, slug).toBe(404)
      expect((await envoyer('DELETE', `/api/campagnes/${slug}/inscription`, a.cookie)).statut, slug).toBe(404)
    }
    expect((await envoyer('POST', chemin, a.cookie, '\u0000')).statut).toBe(409)
    expect((await lire(`/campagnes/${juge.slug}`)).texte).toContain('Connecte-toi avec GitHub pour t&#39;inscrire.')
  })

  it('Boss juge refusé, Boss joueur inscrit sur une place', async () => {
    expect(await envoyer('POST', `/api/campagnes/${juge.slug}/inscription`, juge.cookie, { connaissance: true }))
      .toMatchObject({ statut: 409, json: { message: 'Tu juges cette campagne : tu ne t\'y inscris pas.' } })
    const page = (await lire(`/campagnes/${juge.slug}`, juge.cookie)).texte
    expect(page).toContain('Tu juges cette campagne : tu ne t&#39;y inscris pas.')
    expect(page).not.toContain('S&#39;inscrire</button>')
    expect((await envoyer('POST', `/api/campagnes/${joueur.slug}/inscription`, joueur.cookie, { connaissance: true })).statut).toBe(200)
    expect((await lire(`/api/campagnes/${joueur.slug}`)).json).toMatchObject({ places_restantes: 1 })
    expect((await envoyer('DELETE', `/api/campagnes/${joueur.slug}/inscription`, joueur.cookie)).statut).toBe(200)
  })

  it('inscrit qui ne peut plus se désinscrire : la page dit pourquoi', async () => {
    const c = await boss('juge', 2)
    const a = await membre()
    expect((await envoyer('POST', `/api/campagnes/${c.slug}/inscription`, a.cookie, { connaissance: true })).statut).toBe(200)
    sql(`update public.campagne set statut = 'deliberation' where slug = '${c.slug}'`)
    const page = (await lire(`/campagnes/${c.slug}`, a.cookie)).texte
    expect(page).toContain('Tu es inscrit.')
    expect(page).toContain('La délibération a commencé : tu ne peux plus te désinscrire.')
    expect(page).not.toContain('Me désinscrire</button>')
    sql(`update public.compte set etat = 'suspendu' where id = '${a.u.id}'`)
    expect((await lire(`/campagnes/${c.slug}`, a.cookie)).texte).toContain('Ton compte n&#39;est pas actif : tu ne peux pas te désinscrire.')
  })

  it('visibilité figée dès le premier inscrit : PATCH en 409, choix désactivé sur /boss', async () => {
    const c = await boss('juge', 2)
    const a = await membre()
    const reglages = (visibilite: string) => ({
      titre: c.titre, theme: 'Un minuteur', brief: 'Écris un minuteur de pause.', langages: ['Go'], visibilite, role_boss: 'juge', max_participants: 2,
      ...Object.fromEntries(['ouverture_inscriptions', 'cloture_depot', 'date_resultats'].map((k) => [k, (campagne as Record<string, string>)[k]])),
    })
    const campagne = (await lire(`/api/boss/${c.slug}`, c.cookie)).json
    expect(campagne).toMatchObject({ inscrits: 0 })
    expect((await lire(`/boss/${c.slug}`, c.cookie)).texte).not.toContain('La visibilité ne change plus')
    expect((await envoyer('POST', `/api/campagnes/${c.slug}/inscription`, a.cookie, { connaissance: true })).statut).toBe(200)
    expect((await lire(`/api/boss/${c.slug}`, c.cookie)).json).toMatchObject({ inscrits: 1 })
    expect(await envoyer('PATCH', `/api/boss/${c.slug}`, c.cookie, reglages('invitation')))
      .toMatchObject({ statut: 409, json: { message: 'La visibilité ne change plus une fois qu\'il y a des inscrits.' } })
    expect((await envoyer('PATCH', `/api/boss/${c.slug}`, c.cookie, reglages('publique'))).statut).toBe(200)
    const page = (await lire(`/boss/${c.slug}`, c.cookie)).texte
    expect(page).toContain('La visibilité ne change plus une fois qu&#39;il y a des inscrits.')
    expect(page).toMatch(/id="visibilite-invitation"[^>]*disabled/)
  })

  it('concurrence : 6 comptes pour 2 places, exactement 2 inscrits', async () => {
    const c = await boss('juge', 2)
    const comptes = await Promise.all(Array.from({ length: 6 }, () => membre()))
    const statuts = await Promise.all(comptes.map((m) => envoyer('POST', `/api/campagnes/${c.slug}/inscription`, m.cookie, { connaissance: true }).then((r) => r.statut)))
    expect(statuts.filter((s) => s === 200)).toHaveLength(2)
    expect(statuts.filter((s) => s === 409)).toHaveLength(4)
    expect(inscrits(c.slug)).toBe(2)
    expect((await lire(`/campagnes/${c.slug}`, comptes.find((_, i) => statuts[i] === 409)!.cookie)).texte).toContain('La campagne est complète.')
  })

  it('limite de débit par compte : la 21e inscription en 24 h répond 429', async () => {
    const a = await membre()
    const chemin = `/api/campagnes/${joueur.slug}/inscription`
    for (let i = 0; i < 20; i++) {
      expect((await envoyer('POST', chemin, a.cookie, { connaissance: true })).statut).toBe(200)
      expect((await envoyer('DELETE', chemin, a.cookie)).statut).toBe(200)
    }
    expect(await envoyer('POST', chemin, a.cookie, { connaissance: true }))
      .toMatchObject({ statut: 429, json: { message: 'Trop d\'inscriptions depuis ton compte. Réessaie plus tard.' } })
  })
})
