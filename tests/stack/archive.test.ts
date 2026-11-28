// Archive filtrée du Boss juge (story 5.1) contre la pile locale et le serveur construit : le juge obtient un lien de 60 s qui
// télécharge le zip filtré, et chaque demande est journalisée ; Boss joueur, candidat, autre compte, visiteur, dépôt d'une autre
// campagne, étape ou paramètre invalides : 404 et rien n'est journalisé. La page montre alertes et avertissement, en texte.
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API, connexion, demarrer, nettoyer, sql, statut, utilisateur } from './aide'

const jour = 86_400_000
let serveur: Awaited<ReturnType<typeof demarrer>>
const ids: string[] = []
const service = { apikey: statut.SERVICE_ROLE_KEY, authorization: `Bearer ${statut.SERVICE_ROLE_KEY}`, 'content-type': 'application/json' }
const ligne = (requete: string) => sql(requete).toString().split('\n')[2]!.trim()
const journal = () => Number(ligne(`select count(*) from public.telechargement where campagne_id in ('${juge.id}', '${joueur.id}')`))

async function envoyer(methode: string, chemin: string, cookie: string, corps: unknown = {}) {
  const r = await fetch(serveur.url + chemin, { method: methode, headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(corps) })
  return { statut: r.status, json: await r.json() as Record<string, unknown> }
}
const lire = async (chemin: string, cookie: string) => {
  const r = await fetch(serveur.url + chemin, { headers: { cookie } })
  return { statut: r.status, texte: await r.text() }
}

async function membre() {
  const u = await utilisateur()
  const s = await connexion(u)
  expect((await envoyer('POST', '/api/compte', s.cookie, { pseudo: 'ada_' + randomBytes(4).toString('hex'), charte: true, majeur: true })).statut).toBe(200)
  ids.push(u.id)
  return { ...s, u }
}

// Campagne en délibération, un inscrit (le candidat), son dépôt et, s'il y a lieu, l'archive filtrée posée comme prive le fait.
const ZIP_FILTRE = Buffer.from('504b0506' + '00'.repeat(18), 'hex')
async function campagne(boss: Awaited<ReturnType<typeof membre>>, role: 'juge' | 'joueur', candidat: Awaited<ReturnType<typeof membre>>) {
  const r = await envoyer('POST', '/api/boss', boss.cookie, {
    titre: 'Archive ' + randomBytes(3).toString('hex'), theme: 'Un minuteur', brief: 'Écris un minuteur.', langages: ['Go'],
    visibilite: 'publique', role_boss: role, max_participants: 5,
    ouverture_inscriptions: new Date(Date.now() - 60_000).toISOString(),
    cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
    date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
  })
  expect(r.statut).toBe(200)
  const slug = r.json.slug as string
  expect((await envoyer('POST', `/api/boss/${slug}/ouverture`, boss.cookie)).statut).toBe(200)
  const id = ligne(`select id from public.campagne where slug = '${slug}'`)
  const participation = ligne(`insert into public.participation (campagne_id, compte_id, connaissance_envoi_le) values ('${id}', '${candidat.u.id}', now()) returning id`)
  const filtre = `${id}/${participation}/${crypto.randomUUID()}.filtre.zip`
  const signe = await fetch(`${API}/storage/v1/object/upload/sign/depots/${filtre}`, { method: 'POST', headers: service, body: '{}' })
  const jeton = new URL(((await signe.json()) as { url: string }).url, API).searchParams.get('token')!
  const envoi = await fetch(`${API}/storage/v1/object/upload/sign/depots/${filtre}?token=${jeton}`, { method: 'PUT', headers: { apikey: statut.ANON_KEY, 'content-type': 'application/zip' }, body: ZIP_FILTRE })
  expect(envoi.status).toBe(200)
  const depot = ligne(`insert into public.depot (participation_id, chemin_stockage, chemin_filtre, sha256, nb_fichiers, nb_tokens_estime,
      alerte_manipulation, alertes_integrite, presentation, droit_declare_le)
    values ('${participation}', '${id}/${participation}/${crypto.randomUUID()}.zip', '${filtre}', repeat('a', 64), 1, 100, true,
      '[{"type": "<b>postinstall</b>", "fichier": "package.json", "ligne": 3}]'::jsonb
        || (select jsonb_agg(jsonb_build_object('type', 'fichier minifié', 'fichier', 'm' || i || '.js')) from generate_series(1, 6) i),
      'Présentation', now()) returning id`)
  sql(`update public.campagne set statut = 'deliberation' where id = '${id}'`)
  return { slug, id, depot, filtre }
}

let bossJuge: Awaited<ReturnType<typeof membre>>
let bossJoueur: Awaited<ReturnType<typeof membre>>
let candidat: Awaited<ReturnType<typeof membre>>
let autre: Awaited<ReturnType<typeof membre>>
let juge: Awaited<ReturnType<typeof campagne>>
let joueur: Awaited<ReturnType<typeof campagne>>

beforeAll(async () => {
  serveur = await demarrer(3929, { NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex') })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  ;[bossJuge, bossJoueur, candidat, autre] = [await membre(), await membre(), await membre(), await membre()]
  juge = await campagne(bossJuge, 'juge', candidat)
  joueur = await campagne(bossJoueur, 'joueur', candidat)
})

afterAll(async () => {
  serveur?.arreter()
  // Le stockage interdit l'effacement direct en SQL : par son API, avec la clé de service.
  const noms = [juge?.filtre, joueur?.filtre].filter(Boolean)
  if (noms.length) await fetch(`${API}/storage/v1/object/depots`, { method: 'DELETE', headers: service, body: JSON.stringify({ prefixes: noms }) })
  if (ids.length) sql(`delete from public.campagne where boss_id in (${ids.map((i) => `'${i}'`).join(', ')})`)
  await nettoyer()
})

describe('GET /api/boss/[slug]/archives/[depot]', () => {
  it('Boss juge : un lien de 60 s qui télécharge le zip filtré ; la demande est journalisée', async () => {
    const avant = journal()
    const r = await lire(`/api/boss/${juge.slug}/archives/${juge.depot}`, bossJuge.cookie)
    expect(r.statut).toBe(200)
    const { url } = JSON.parse(r.texte) as { url: string }
    expect(url).toContain(`/storage/v1/object/sign/depots/${juge.filtre}?token=`)
    expect(url).toContain('download=')
    const charge = JSON.parse(Buffer.from(new URL(url).searchParams.get('token')!.split('.')[1]!, 'base64url').toString()) as { exp: number; iat: number }
    expect(charge.exp - charge.iat).toBe(60)
    const archive = await fetch(url)
    expect(archive.status).toBe(200)
    expect(archive.headers.get('content-disposition')).toContain('attachment')
    expect(Buffer.from(await archive.arrayBuffer())).toEqual(ZIP_FILTRE)
    expect(journal()).toBe(avant + 1)
    expect(ligne(`select compte_id || ' ' || depot_id from public.telechargement order by telecharge_le desc limit 1`)).toBe(`${bossJuge.u.id} ${juge.depot}`)
  })

  it('404 et rien de journalisé : Boss joueur, candidat, autre compte, visiteur, dépôt d\'une autre campagne, paramètre invalide, requête d\'un autre site ou d\'un sous-domaine frère', async () => {
    const avant = journal()
    const refus = [
      [`/api/boss/${joueur.slug}/archives/${joueur.depot}`, bossJoueur.cookie],
      [`/api/boss/${juge.slug}/archives/${juge.depot}`, candidat.cookie],
      [`/api/boss/${juge.slug}/archives/${juge.depot}`, autre.cookie],
      [`/api/boss/${juge.slug}/archives/${juge.depot}`, ''],
      [`/api/boss/${juge.slug}/archives/${joueur.depot}`, bossJuge.cookie],
      [`/api/boss/${juge.slug}/archives/${crypto.randomUUID()}`, bossJuge.cookie],
      [`/api/boss/${juge.slug}/archives/pas-un-uuid`, bossJuge.cookie],
      [`/api/boss/${juge.slug}/archives/%00`, bossJuge.cookie],
      [`/api/boss/${juge.slug}/archives/%C3%28`, bossJuge.cookie],
    ] as const
    for (const [chemin, cookie] of refus) expect((await lire(chemin, cookie)).statut, chemin).toBe(404)
    // Lien posé sur un autre site ou un sous-domaine frère : le navigateur envoie le cookie (SameSite=Lax) et Sec-Fetch-Site.
    for (const origine of ['cross-site', 'same-site']) {
      const r = await fetch(serveur.url + `/api/boss/${juge.slug}/archives/${juge.depot}`, { headers: { cookie: bossJuge.cookie, 'sec-fetch-site': origine } })
      expect(r.status, origine).toBe(404)
    }
    expect(journal()).toBe(avant)
  })

  it('hors délibération et prête : 404, rien de journalisé ; en prête : permis', async () => {
    const avant = journal()
    try {
      sql(`update public.campagne set statut = 'prete' where id = '${juge.id}'`)
      expect((await lire(`/api/boss/${juge.slug}/archives/${juge.depot}`, bossJuge.cookie)).statut).toBe(200)
      sql(`update public.campagne set statut = 'publiee' where id = '${juge.id}'`)
      expect((await lire(`/api/boss/${juge.slug}/archives/${juge.depot}`, bossJuge.cookie)).statut).toBe(404)
      expect(journal()).toBe(avant + 1)
    } finally {
      // Remise en délibération pour la suite (le graphe des transitions l'interdit : déclencheur coupé le temps de l'écriture).
      sql(`alter table public.campagne disable trigger campagne_transition; update public.campagne set statut = 'deliberation' where id = '${juge.id}'; alter table public.campagne enable trigger campagne_transition`)
    }
  })
})

describe('refus traduits en 404 et page vouée au refus', () => {
  const archive = () => lire(`/api/boss/${juge.slug}/archives/${juge.depot}`, bossJuge.cookie)
  const page = async () => (await lire(`/boss/${juge.slug}`, bossJuge.cookie)).texte
  const sansDeclencheur = (requete: string) => sql(`alter table public.campagne disable trigger campagne_transition; ${requete}; alter table public.campagne enable trigger campagne_transition`)

  it('ouverte : 404, et la campagne ne porte aucun dépôt', async () => {
    const avant = journal()
    try {
      sansDeclencheur(`update public.campagne set statut = 'ouverte' where id = '${juge.id}'`)
      expect((await archive()).statut).toBe(404)
      expect(JSON.parse((await lire(`/api/boss/${juge.slug}`, bossJuge.cookie)).texte).depots).toEqual([])
      expect(journal()).toBe(avant)
    } finally {
      sansDeclencheur(`update public.campagne set statut = 'deliberation' where id = '${juge.id}'`)
    }
  })

  it('bloquée, échue, compte suspendu, sans archive filtrée : 404, rien de journalisé, une phrase à la place du bouton', async () => {
    const avant = journal()
    const dates = ligne(`select ouverture_inscriptions || '|' || cloture_depot || '|' || date_resultats from public.campagne where id = '${juge.id}'`).split('|')
    const cas: [string, string, string][] = [
      [`update public.campagne set bloquee_le = now(), motif_blocage = 'Motif' where id = '${juge.id}'`,
        `update public.campagne set bloquee_le = null, motif_blocage = null where id = '${juge.id}'`, 'L&#39;archive ne se télécharge plus'],
      [`update public.campagne set ouverture_inscriptions = now() - interval '3 days', cloture_depot = now() - interval '2 days', date_resultats = now() - interval '1 minute' where id = '${juge.id}'`,
        `update public.campagne set ouverture_inscriptions = '${dates[0]}', cloture_depot = '${dates[1]}', date_resultats = '${dates[2]}' where id = '${juge.id}'`, 'L&#39;archive ne se télécharge plus'],
      [`update public.compte set etat = 'suspendu' where id = '${bossJuge.u.id}'`,
        `update public.compte set etat = 'actif' where id = '${bossJuge.u.id}'`, 'L&#39;archive ne se télécharge plus'],
      [`update public.depot set chemin_filtre = null where id = '${juge.depot}'`,
        `update public.depot set chemin_filtre = '${juge.filtre}' where id = '${juge.depot}'`, 'Pas d&#39;archive filtrée pour ce dépôt.'],
    ]
    for (const [poser, retirer, phrase] of cas) {
      try {
        sql(poser)
        expect((await archive()).statut, poser).toBe(404)
        const texte = await page()
        expect(texte, poser).toContain(phrase)
        expect(texte, poser).not.toContain('Télécharger l&#39;archive filtrée')
      } finally {
        sql(retirer)
      }
    }
    expect(journal()).toBe(avant)
    expect(await page()).toContain('Télécharger l&#39;archive filtrée')
  })
})

describe('signature en échec', () => {
  it('objet absent du bucket : 503 avec sa phrase, et la trace reste (un essai compte)', async () => {
    const avant = journal()
    const effacer = await fetch(`${API}/storage/v1/object/depots`, { method: 'DELETE', headers: service, body: JSON.stringify({ prefixes: [juge.filtre] }) })
    expect(effacer.status).toBe(200)
    const r = await lire(`/api/boss/${juge.slug}/archives/${juge.depot}`, bossJuge.cookie)
    expect(r.statut).toBe(503)
    expect(JSON.parse(r.texte).message).toBe('L\'archive ne peut pas être téléchargée pour le moment. Réessaie dans un instant.')
    expect(journal()).toBe(avant + 1)
  })
})

describe('page du Boss', () => {
  it('Boss juge : alertes en texte, avertissement et bouton ; Boss joueur : ni alertes ni bouton', async () => {
    const page = (await lire(`/boss/${juge.slug}`, bossJuge.cookie)).texte
    expect(page).toContain('N&#39;exécute jamais ce code.')
    expect(page).toContain('Télécharger l&#39;archive filtrée')
    expect(page).toContain('tentative de manipulation du jury')
    expect(page).toContain('&lt;b&gt;postinstall&lt;/b&gt;')
    expect(page).not.toContain('<b>postinstall</b>')
    expect(page).toContain('package.json, ligne 3')
    // Six alertes d'un même type : cinq exemples et le reste compté.
    expect(page).toMatch(/fichier minifié(&nbsp;|\u00a0): m1\.js ; m2\.js ; m3\.js ; m4\.js ; m5\.js, et 1 autre</)
    const api = JSON.parse((await lire(`/api/boss/${joueur.slug}`, bossJoueur.cookie)).texte) as { depots: Record<string, unknown>[] }
    expect(api.depots).toEqual([expect.objectContaining({ depot_id: joueur.depot, alerte_manipulation: null, alertes_integrite: null, archive_disponible: null })])
    const pageJoueur = (await lire(`/boss/${joueur.slug}`, bossJoueur.cookie)).texte
    expect(pageJoueur).not.toContain('postinstall')
    expect(pageJoueur).not.toContain('archive filtrée')
  })
})
