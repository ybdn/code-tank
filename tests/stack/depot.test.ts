// Dépôt (story 3.3) contre la pile locale et le serveur construit : URL signée et vrai envoi au bucket depots, deposer et
// appel du jury (qui échoue ici : le dépôt réussit quand même), refus (415, 401, 404, 409), retrait et effacement des
// archives, page de dépôt.
import { createServer, type IncomingHttpHeaders } from 'node:http'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API, connexion, demarrer, nettoyer, sql, statut, utilisateur } from './aide'

let serveur: Awaited<ReturnType<typeof demarrer>>
const ids: string[] = []
const jour = 86_400_000
const marque = randomBytes(4).toString('hex')
// Faux jury : note chaque appel et répond 500, comme un jury en panne.
const appelsJury: { headers: IncomingHttpHeaders; corps: string }[] = []
const jury = createServer((req, res) => {
  let corps = ''
  req.on('data', (d) => { corps += d })
  req.on('end', () => { appelsJury.push({ headers: req.headers, corps }); res.statusCode = 500; res.end() })
})
const SECRET_JURY = 'secret-jury-de-test-' + randomBytes(16).toString('hex')

async function envoyer(methode: string, chemin: string, cookie: string, corps: unknown = {}, type = 'application/json') {
  const r = await fetch(serveur.url + chemin, {
    method: methode,
    headers: { 'x-forwarded-for': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`, 'content-type': type, cookie },
    body: JSON.stringify(corps),
  })
  return { statut: r.status, json: await r.json() as { message?: string; chemin?: string; jeton?: string } }
}
const lire = async (chemin: string, cookie?: string) => {
  const r = await fetch(serveur.url + chemin, { headers: cookie ? { cookie } : {} })
  return { statut: r.status, json: r.headers.get('content-type')?.includes('json') ? await r.json() : null, texte: r.headers.get('content-type')?.includes('html') ? await r.text() : '' }
}
const ligne = (requete: string) => sql(requete).toString().split('\n')[2]!.trim()

async function membre() {
  const u = await utilisateur()
  const s = await connexion(u)
  const pseudo = 'ada_' + randomBytes(4).toString('hex')
  expect((await envoyer('POST', '/api/compte', s.cookie, { pseudo, charte: true, majeur: true })).statut).toBe(200)
  ids.push(u.id)
  return { ...s, u, pseudo }
}

async function campagne(role_boss: 'juge' | 'joueur') {
  const m = await membre()
  const r = await envoyer('POST', '/api/boss', m.cookie, {
    titre: `Dépôt ${role_boss} ${marque}`, theme: 'Un minuteur', brief: 'Écris un minuteur de pause.', langages: ['Go'], visibilite: 'publique',
    role_boss, max_participants: 5,
    ouverture_inscriptions: new Date(Date.now() - 60_000).toISOString(),
    cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
    date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
  })
  expect(r.statut).toBe(200)
  const slug = r.json.slug as unknown as string
  expect((await envoyer('POST', `/api/boss/${slug}/ouverture`, m.cookie)).statut).toBe(200)
  return { ...m, slug }
}

async function inscrit(slug: string) {
  const a = await membre()
  expect((await envoyer('POST', `/api/campagnes/${slug}/inscription`, a.cookie, { connaissance: true })).statut).toBe(200)
  return a
}

// Un vrai envoi par l'URL signée, comme uploadToSignedUrl du navigateur (PUT, même point d'accès).
const ZIP_VIDE = Buffer.from('504b0506' + '00'.repeat(18), 'hex')
async function televerser(chemin: string, jeton: string, corps: Buffer = ZIP_VIDE, type = 'application/zip') {
  const r = await fetch(`${API}/storage/v1/object/upload/sign/depots/${chemin}?token=${jeton}`, {
    method: 'PUT', headers: { apikey: statut.ANON_KEY, 'content-type': type }, body: corps,
  })
  await r.body?.cancel()
  return r.status
}
async function envoi(slug: string, cookie: string) {
  const r = await envoyer('POST', `/api/campagnes/${slug}/depot/url`, cookie)
  expect(r.statut).toBe(200)
  expect(await televerser(r.json.chemin!, r.json.jeton!)).toBe(200)
  return r.json.chemin!
}
// Clé de service : ce que fait prive (story 3.4) pour poser l'archive filtrée, et le nettoyage des objets du test.
const service = { apikey: statut.SERVICE_ROLE_KEY, authorization: `Bearer ${statut.SERVICE_ROLE_KEY}`, 'content-type': 'application/json' }
async function deposerEnService(chemin: string) {
  const r = await fetch(`${API}/storage/v1/object/upload/sign/depots/${chemin}`, { method: 'POST', headers: service, body: '{}' })
  const { url } = await r.json() as { url: string }
  expect(await televerser(chemin, new URL(url, API).searchParams.get('token')!)).toBe(200)
}
const objets = (chemin: string) => Number(ligne(`select count(*) from storage.objects where bucket_id = 'depots' and name = '${chemin}'`))

let juge: Awaited<ReturnType<typeof campagne>>

beforeAll(async () => {
  await new Promise<void>((ok) => jury.listen(3998, '127.0.0.1', ok))
  serveur = await demarrer(3918, {
    NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex'),
    NUXT_JURY_URL: 'http://127.0.0.1:3998/api/jury',
    NUXT_JURY_SECRET: SECRET_JURY,
  })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  juge = await campagne('juge')
})
afterAll(async () => {
  serveur?.arreter()
  jury.close()
  // Le stockage interdit l'effacement direct en SQL : par son API, avec la clé de service.
  const noms = ids.length ? sql(`select name from storage.objects where bucket_id = 'depots' and split_part(name, '/', 1) in (select c.id::text from public.campagne c where c.boss_id in (${ids.map((i) => `'${i}'`).join(', ')}))`)
    .toString().split('\n').slice(2).map((l) => l.trim()).filter((l) => /\.zip$/.test(l)) : []
  if (noms.length) await fetch(`${API}/storage/v1/object/depots`, { method: 'DELETE', headers: service, body: JSON.stringify({ prefixes: noms }) })
  if (ids.length) sql(`delete from public.campagne where boss_id in (${ids.map((i) => `'${i}'`).join(', ')})`)
  await nettoyer()
})

describe('dépôt', () => {
  it('envoi signé, deposer, jury appelé sans corps ; réception en attente, règles figées', async () => {
    const a = await inscrit(juge.slug)
    let page = (await lire(`/campagnes/${juge.slug}`, a.cookie)).texte
    expect(page).toContain('Déposer mon projet')
    page = (await lire(`/campagnes/${juge.slug}/depot`, a.cookie)).texte
    expect(page).toContain('Tu n&#39;as pas encore déposé.')
    expect(page).toContain(`Ton code et ta présentation seront envoyés au compte Anthropic de ${juge.pseudo}`)
    expect(page).toContain('support@ybdn.io')
    expect(page).toContain('J&#39;ai le droit de déposer ce code (il est à moi, sous licence libre, ou j&#39;ai l&#39;accord écrit de son propriétaire).')

    const url = await envoyer('POST', `/api/campagnes/${juge.slug}/depot/url`, a.cookie)
    expect(url.statut).toBe(200)
    const [campagneId, participationId, fichier] = url.json.chemin!.split('/')
    expect(campagneId).toBe(ligne(`select id from public.campagne where slug = '${juge.slug}'`))
    expect(participationId).toBe(ligne(`select p.id from public.participation p where p.compte_id = '${a.u.id}'`))
    expect(fichier).toMatch(/^[0-9a-f-]{36}\.zip$/)
    // Le bucket refuse un autre type qu'un zip, et un second envoi au même chemin.
    expect(await televerser(url.json.chemin!, url.json.jeton!, Buffer.from('bonjour'), 'text/plain')).toBeGreaterThanOrEqual(400)
    expect(await televerser(url.json.chemin!, url.json.jeton!)).toBe(200)
    expect(await televerser(url.json.chemin!, url.json.jeton!)).toBeGreaterThanOrEqual(400)

    const avant = appelsJury.length
    const corps = { chemin: url.json.chemin, presentation: '  Un minuteur en Go.  ', demande: 'Je vise 8/10', droit: true }
    expect((await envoyer('POST', `/api/campagnes/${juge.slug}/depot`, a.cookie, corps)).statut).toBe(200)
    expect(ligne(`select r.statut || '|' || r.presentation || '|' || r.demande || '|' || (r.droit_declare_le is not null) from public.reception r join public.participation p on p.id = r.participation_id where p.compte_id = '${a.u.id}'`))
      .toBe('en_attente|Un minuteur en Go.|Je vise 8/10|true')
    expect(ligne(`select regles_figees_le is not null from public.campagne where slug = '${juge.slug}'`)).toBe('t')
    await expect.poll(() => appelsJury.length).toBe(avant + 1)
    expect(appelsJury.at(-1)).toMatchObject({ headers: { authorization: `Bearer ${SECRET_JURY}` }, corps: '' })

    expect((await lire(`/api/campagnes/${juge.slug}`, a.cookie)).json).toMatchObject({ reception: { statut: 'en_attente', presentation: 'Un minuteur en Go.' }, depot: null })
    page = (await lire(`/campagnes/${juge.slug}/depot`, a.cookie)).texte
    expect(page).toContain('Contrôle en cours de ton archive')
    expect(page).toContain('Ton dépôt précédent est en cours de contrôle : attends son résultat pour redéposer.')
    expect(page).not.toContain('Déposer</button>')
    expect((await lire(`/campagnes/${juge.slug}`, a.cookie)).texte).toContain('Retire d&#39;abord ton dépôt pour te désinscrire.')

    // Ni URL d'envoi (rien ne resterait orphelin dans le bucket), ni dépôt, tant que la réception attend.
    for (const route of ['depot/url', 'depot']) {
      expect(await envoyer('POST', `/api/campagnes/${juge.slug}/${route}`, a.cookie, corps))
        .toMatchObject({ statut: 409, json: { message: 'Ton dépôt précédent est en cours de contrôle.' } })
    }
    expect(await envoyer('DELETE', `/api/campagnes/${juge.slug}/depot`, a.cookie))
      .toMatchObject({ statut: 409, json: { message: 'Ton dépôt est en cours de contrôle : attends son résultat pour le retirer.' } })
    expect(await envoyer('DELETE', `/api/campagnes/${juge.slug}/inscription`, a.cookie))
      .toMatchObject({ statut: 409, json: { message: 'Retire d\'abord ton dépôt pour te désinscrire.' } })
  })

  it('refus : 415, 401, 404, case, présentation, chemin, non inscrit, Boss juge ; jamais 500', async () => {
    const a = await inscrit(juge.slug)
    const depot = `/api/campagnes/${juge.slug}/depot`
    const chemin = await envoi(juge.slug, a.cookie)
    const corps = { chemin, presentation: 'Un projet.', demande: '', droit: true }
    for (const route of [`${depot}/url`, depot]) {
      expect((await envoyer('POST', route, a.cookie, corps, 'text/plain')).statut, route).toBe(415)
      expect((await envoyer('POST', route, '', corps)).statut, route).toBe(401)
      for (const slug of ['%00', '%ED%A0%80', `inconnue-${marque}`]) {
        expect((await envoyer('POST', route.replace(juge.slug, slug), a.cookie, corps)).statut, slug).toBe(404)
      }
    }
    expect((await envoyer('DELETE', depot, a.cookie, {}, 'text/plain')).statut).toBe(415)
    expect((await envoyer('DELETE', depot, '')).statut).toBe(401)
    expect(await envoyer('POST', depot, a.cookie, { ...corps, droit: false })).toMatchObject({ statut: 409, json: { message: 'Coche la case : tu dois avoir le droit de déposer ce code.' } })
    expect(await envoyer('POST', depot, a.cookie, { ...corps, presentation: ' \n ' })).toMatchObject({ statut: 409, json: { message: 'La présentation fait entre 1 et 500 caractères.' } })
    // Caractère nul et demi-paire UTF-16 : nettoyés par la route, la base répond sur la règle suivante (chemin), pas en 500.
    expect(await envoyer('POST', depot, a.cookie, { ...corps, chemin: '\u0000', presentation: '\u0000\ud800', demande: '\ud800' }))
      .toMatchObject({ statut: 409, json: { message: 'Ton archive n\'est pas arrivée : recommence l\'envoi.' } })
    expect(await envoyer('POST', depot, a.cookie, '\u0000')).toMatchObject({ statut: 409 })
    expect(await envoyer('POST', depot, a.cookie, { ...corps, chemin: chemin.replace(/[0-9a-f-]{36}\.zip$/, `${crypto.randomUUID()}.zip`) }))
      .toMatchObject({ statut: 409, json: { message: 'Ton archive n\'est pas arrivée : recommence l\'envoi.' } })
    expect(await envoyer('DELETE', depot, a.cookie)).toMatchObject({ statut: 404, json: { message: 'Tu n\'as pas de dépôt dans cette campagne.' } })

    const b = await membre()
    expect(await envoyer('POST', `${depot}/url`, b.cookie)).toMatchObject({ statut: 409, json: { message: 'Tu n\'es pas inscrit à cette campagne.' } })
    expect(await envoyer('POST', depot, b.cookie, corps)).toMatchObject({ statut: 409, json: { message: 'Tu n\'es pas inscrit à cette campagne.' } })
    expect((await lire(`/campagnes/${juge.slug}/depot`, b.cookie)).texte).toContain('Inscris-toi à la campagne pour y déposer.')
    expect(await envoyer('POST', `${depot}/url`, juge.cookie)).toMatchObject({ statut: 409, json: { message: 'Tu juges cette campagne : tu n\'y déposes pas.' } })
    expect((await lire(`/campagnes/${juge.slug}/depot`, juge.cookie)).texte).toContain('Tu juges cette campagne : tu n&#39;y déposes pas.')
    expect((await lire(`/campagnes/${juge.slug}/depot`)).texte).toContain('Connecte-toi avec GitHub pour déposer.')
    expect((await lire(`/campagnes/inconnue-${marque}/depot`)).statut).toBe(404)
  })

  it('limite d\'envois par compte : la 21e URL signée en 24 h répond 429 avec Retry-After', async () => {
    const a = await inscrit(juge.slug)
    const empreinte = createHash('sha256').update(`${a.u.id}:compte`).digest('hex')
    sql(`insert into public.debit (empreinte, action) select '${empreinte}', 'envoi' from generate_series(1, 20)`)
    const r = await fetch(`${serveur.url}/api/campagnes/${juge.slug}/depot/url`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: a.cookie }, body: '{}' })
    expect(r.status).toBe(429)
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await r.json()).toMatchObject({ message: 'Trop d\'envois depuis ton compte. Réessaie plus tard.' })
  })

  it('date limite passée : URL et dépôt refusés, la page dit pourquoi', async () => {
    const c = await campagne('juge')
    const a = await inscrit(c.slug)
    const chemin = await envoi(c.slug, a.cookie)
    sql(`update public.campagne set ouverture_inscriptions = now() - interval '2 days', cloture_depot = now() - interval '1 minute', date_resultats = now() + interval '5 days' where slug = '${c.slug}'`)
    expect(await envoyer('POST', `/api/campagnes/${c.slug}/depot/url`, a.cookie)).toMatchObject({ statut: 409, json: { message: 'La date limite de dépôt est passée.' } })
    expect(await envoyer('POST', `/api/campagnes/${c.slug}/depot`, a.cookie, { chemin, presentation: 'x', droit: true }))
      .toMatchObject({ statut: 409, json: { message: 'La date limite de dépôt est passée.' } })
    const page = (await lire(`/campagnes/${c.slug}/depot`, a.cookie)).texte
    expect(page).toContain('La date limite de dépôt est passée.')
    expect(page).not.toContain('Déposer</button>')
  })

  it('retrait : la ligne disparaît et les archives sont effacées du bucket', async () => {
    const c = await campagne('joueur')
    expect((await envoyer('POST', `/api/campagnes/${c.slug}/inscription`, c.cookie, { connaissance: true })).statut).toBe(200)
    const zip = await envoi(c.slug, c.cookie)
    expect((await envoyer('POST', `/api/campagnes/${c.slug}/depot`, c.cookie, { chemin: zip, presentation: 'Le projet du Boss.', droit: true })).statut).toBe(200)
    // prive (story 3.4) accepte la réception : simulé en SQL, avec une archive filtrée posée par la clé de service.
    const filtre = zip.replace('.zip', '.filtre.zip')
    await deposerEnService(filtre)
    const p = ligne(`select p.id from public.participation p where p.compte_id = '${c.u.id}'`)
    sql(`delete from public.reception where participation_id = '${p}'`)
    sql(`insert into public.depot (participation_id, chemin_stockage, chemin_filtre, sha256, nb_fichiers, nb_tokens_estime, presentation, droit_declare_le)
      values ('${p}', '${zip}', '${filtre}', '${'a'.repeat(64)}', 1, 10, 'Le projet du Boss.', now())`)
    expect([objets(zip), objets(filtre)]).toEqual([1, 1])

    expect((await lire(`/api/campagnes/${c.slug}`, c.cookie)).json).toMatchObject({ reception: null, depot: { presentation: 'Le projet du Boss.' } })
    const page = (await lire(`/campagnes/${c.slug}/depot`, c.cookie)).texte
    expect(page).toContain('Retirer mon dépôt</button>')
    expect(page).toContain('Redéposer</button>')
    expect((await lire(`/api/campagnes/${c.slug}`, (await inscrit(c.slug)).cookie)).json).toMatchObject({ reception: null, depot: null })

    expect((await envoyer('DELETE', `/api/campagnes/${c.slug}/depot`, c.cookie)).statut).toBe(200)
    expect(ligne(`select count(*) from public.depot where participation_id = '${p}'`)).toBe('0')
    expect(objets(zip)).toBe(0)
    expect(objets(filtre)).toBe(0)
    expect((await envoyer('DELETE', `/api/campagnes/${c.slug}/inscription`, c.cookie)).statut).toBe(200)
  })
})
