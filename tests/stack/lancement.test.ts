// Lancement de la délibération (story 4.3) contre la pile locale et le serveur construit, avec une clé factice reconnaissable et
// un faux count_tokens (aucun appel réel à Anthropic) : refus de la route (format, jeton d'abonnement, count_tokens 401, 403,
// 500, panne ; corps ; 415 ; 429), refus de la base (plafond, campagne pas prête, troisième lancement, clé déjà présente),
// lancement réussi, relance ; et la preuve que la clé factice n'apparaît dans aucune réponse, aucun journal du site ni de la pile.
import { execFileSync, spawnSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ENGAGEMENTS_VERSION } from '../../shared/utils/engagements'
import { demarrer, nettoyer, sql, connexion, utilisateur } from './aide'

const CANARI = 'FAUSSECLECANARI'
const CLE = `sk-ant-api03-${CANARI}0123`
const jour = 86_400_000
let serveur: Awaited<ReturnType<typeof demarrer>>
let fauxAnthropic: Server
let fauxJury: Server
// Comportement du faux count_tokens, et ce qu'il a reçu.
let mode: 200 | 401 | 403 | 500 | 'panne' = 200
const recus: { cle: unknown; corps: string }[] = []
const appelsJury: { autorisation: unknown; corps: string }[] = []
// Tout ce que le site a répondu, pour y chercher la clé.
const reponses: string[] = []
const ids: string[] = []

const ouvrir = (serveurHttp: Server) => new Promise<number>((ok) => serveurHttp.listen(0, '127.0.0.1', () => ok((serveurHttp.address() as AddressInfo).port)))
const ligne = (requete: string) => sql(requete).toString().split('\n')[2]!.trim()

async function envoyer(methode: string, chemin: string, cookie: string, corps: unknown = {}, ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`, type = 'application/json') {
  const r = await fetch(serveur.url + chemin, {
    method: methode, headers: { 'x-forwarded-for': ip, 'content-type': type, cookie }, body: typeof corps === 'string' ? corps : JSON.stringify(corps),
  })
  const texte = await r.text()
  reponses.push(texte)
  return { statut: r.status, json: JSON.parse(texte) as Record<string, unknown> }
}
const lire = async (chemin: string, cookie: string) => {
  const r = await fetch(serveur.url + chemin, { headers: { cookie } })
  const texte = await r.text()
  reponses.push(texte)
  return { statut: r.status, json: JSON.parse(texte) as Record<string, unknown> }
}
const corps = (sur: Record<string, unknown> = {}) => ({ plafond_usd: 10, cle: CLE, engagements: [true, true, true], version: ENGAGEMENTS_VERSION, ...sur })

async function membre() {
  const u = await utilisateur()
  const s = await connexion(u)
  expect((await envoyer('POST', '/api/compte', s.cookie, { pseudo: 'ada_' + randomBytes(4).toString('hex'), charte: true, majeur: true })).statut).toBe(200)
  ids.push(u.id)
  return { ...s, u }
}

let boss: Awaited<ReturnType<typeof membre>>
let autre: Awaited<ReturnType<typeof membre>>
let slug: string
let campagneId: string
let chemin: string

beforeAll(async () => {
  fauxAnthropic = createServer((req, res) => {
    let corpsRecu = ''
    req.on('data', (d) => { corpsRecu += d })
    req.on('end', () => {
      recus.push({ cle: req.headers['x-api-key'], corps: corpsRecu })
      if (mode === 'panne') return req.socket.destroy()
      res.writeHead(mode, { 'content-type': 'application/json' }).end(JSON.stringify({ input_tokens: 8, error: { message: `clé ${String(req.headers['x-api-key'])} refusée` } }))
    })
  })
  fauxJury = createServer((req, res) => {
    let corpsRecu = ''
    req.on('data', (d) => { corpsRecu += d })
    req.on('end', () => { appelsJury.push({ autorisation: req.headers.authorization, corps: corpsRecu }); res.writeHead(202).end() })
  })
  const [portAnthropic, portJury] = [await ouvrir(fauxAnthropic), await ouvrir(fauxJury)]
  serveur = await demarrer(3925, {
    NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex'),
    NUXT_ANTHROPIC_URL: `http://127.0.0.1:${portAnthropic}/v1/messages/count_tokens`,
    NUXT_JURY_URL: `http://127.0.0.1:${portJury}/api/jury`,
    NUXT_JURY_SECRET: 'secret-du-jury-de-test-' + randomBytes(16).toString('hex'),
  })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  boss = await membre()
  autre = await membre()
  const r = await envoyer('POST', '/api/boss', boss.cookie, {
    titre: 'Lancement ' + randomBytes(3).toString('hex'), theme: 'Un minuteur', brief: 'Écris un minuteur.', langages: ['Go'],
    visibilite: 'publique', role_boss: 'juge', max_participants: 5,
    ouverture_inscriptions: new Date(Date.now() - 60_000).toISOString(),
    cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
    date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
  })
  expect(r.statut).toBe(200)
  slug = r.json.slug as string
  expect((await envoyer('POST', `/api/boss/${slug}/ouverture`, boss.cookie)).statut).toBe(200)
  campagneId = ligne(`select id from public.campagne where slug = '${slug}'`)
  chemin = `/api/boss/${slug}/lancement`
  // Un dépôt de 100 000 tokens estimés : pire cas 2,20 $.
  const participation = ligne(`insert into public.participation (campagne_id, compte_id, connaissance_envoi_le) values ('${campagneId}', '${autre.u.id}', now()) returning id`)
  sql(`insert into public.depot (participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, presentation, droit_declare_le)
    values ('${participation}', '${campagneId}/${participation}/${crypto.randomUUID()}.zip', repeat('a', 64), 1, 100000, 'Présentation', now())`)
  sql(`update public.campagne set cloture_depot = now() - interval '1 minute', date_resultats = now() + interval '5 days' where id = '${campagneId}'`)
})

afterAll(async () => {
  serveur?.arreter()
  fauxAnthropic?.close()
  fauxJury?.close()
  if (ids.length) sql(`delete from public.campagne where boss_id in (${ids.map((i) => `'${i}'`).join(', ')})`)
  sql(`delete from vault.secrets where name = 'cle_boss_${campagneId}'`)
  await nettoyer()
})

const etat = () => ligne(`select lancements || ':' || statut || ':' || coalesce(cle_fin, '-') from public.campagne where id = '${campagneId}'`)
const secrets = () => Number(ligne(`select count(*) from vault.secrets where name = 'cle_boss_${campagneId}'`))

describe('POST /api/boss/[slug]/lancement : refus de la route, rien n\'est consommé', () => {
  it('404 sans session et pour un autre compte', async () => {
    expect((await envoyer('POST', chemin, '', corps())).statut).toBe(404)
    expect((await envoyer('POST', chemin, autre.cookie, corps())).statut).toBe(404)
  })

  it('415 hors JSON, même avec la clé dans le corps', async () => {
    expect((await envoyer('POST', chemin, boss.cookie, JSON.stringify(corps()), undefined, 'text/plain')).statut).toBe(415)
  })

  it('400 : plafond, engagements ; 409 : version des engagements', async () => {
    for (const plafond_usd of [0, -1, 10001, '10', null, Number.NaN]) {
      expect((await envoyer('POST', chemin, boss.cookie, corps({ plafond_usd }))).statut, String(plafond_usd)).toBe(400)
    }
    for (const engagements of [[true, true], [true, true, false], 'oui', undefined, [true, true, 1]]) {
      expect((await envoyer('POST', chemin, boss.cookie, corps({ engagements }))).statut).toBe(400)
    }
    expect((await envoyer('POST', chemin, boss.cookie, corps({ version: 'ancienne' }))).statut).toBe(409)
    expect((await envoyer('POST', chemin, boss.cookie, '[1,2')).statut).toBe(400)
  })

  it('400 pour une clé hors format ou un jeton d\'abonnement, sans appeler Anthropic', async () => {
    const avant = recus.length
    for (const cle of [`${CANARI}-sans-prefixe-0123456789`, `sk-ant-oat01-${CANARI}0123456789`, `sk-ant-api03-${CANARI}!!0123456789`, `sk-ant-${CANARI}`, 12, null]) {
      const r = await envoyer('POST', chemin, boss.cookie, corps({ cle }))
      expect(r.statut, String(cle)).toBe(400)
      expect(r.json.message).toContain('Console Anthropic')
    }
    expect(recus.length).toBe(avant)
    expect(etat()).toBe('0:ouverte:-')
  })

  it('count_tokens : la clé est envoyée telle quelle, sans code ; 401 et 403 refusent (400), 500 et panne ne tranchent pas (502)', async () => {
    mode = 401
    expect((await envoyer('POST', chemin, boss.cookie, corps())).statut).toBe(400)
    expect(recus.at(-1)!.cle).toBe(CLE)
    const envoye = JSON.parse(recus.at(-1)!.corps) as { model: string; messages: { content: string }[] }
    expect(envoye.model).toBe('claude-opus-5-5')
    expect(envoye.messages).toEqual([{ role: 'user', content: 'Bonjour.' }])
    mode = 403
    expect((await envoyer('POST', chemin, boss.cookie, corps())).statut).toBe(400)
    mode = 500
    expect((await envoyer('POST', chemin, boss.cookie, corps())).statut).toBe(502)
    mode = 'panne'
    expect((await envoyer('POST', chemin, boss.cookie, corps())).statut).toBe(502)
    mode = 200
    // Aucun lancement consommé, aucune clé rangée, rien d'écrit.
    expect(etat()).toBe('0:ouverte:-')
    expect(secrets()).toBe(0)
    expect(ligne(`select count(*) from public.audit a join public.depot d on d.id = a.depot_id join public.participation p on p.id = d.participation_id where p.campagne_id = '${campagneId}'`)).toBe('0')
    expect(ligne(`select count(*) from public.engagement where campagne_id = '${campagneId}'`)).toBe('0')
    expect(appelsJury).toHaveLength(0)
    // Le journal ne porte que le statut.
    expect(serveur.journal()).toContain('code 401.')
  })
})

describe('POST /api/boss/[slug]/lancement : refus de la base', () => {
  it('409 plafond sous le pire cas, avec l\'écart', async () => {
    const r = await envoyer('POST', chemin, boss.cookie, corps({ plafond_usd: 2 }))
    expect(r).toMatchObject({ statut: 409, json: { message: 'Plafond insuffisant : il manque 0,20 $.' } })
    expect(etat()).toBe('0:ouverte:-')
    expect(secrets()).toBe(0)
  })

  it('409 campagne pas prête (brouillon)', async () => {
    const b = await envoyer('POST', '/api/boss', autre.cookie, {
      titre: 'Brouillon ' + randomBytes(3).toString('hex'), theme: 'Un minuteur', brief: 'Écris un minuteur.', langages: ['Go'],
      visibilite: 'publique', role_boss: 'juge', max_participants: 5,
      ouverture_inscriptions: new Date(Date.now() + jour).toISOString(),
      cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
      date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
    })
    expect(b.statut).toBe(200)
    try {
      const r = await envoyer('POST', `/api/boss/${b.json.slug as string}/lancement`, autre.cookie, corps())
      expect(r).toMatchObject({ statut: 409, json: { message: 'La délibération se lance quand la campagne est ouverte et ses dépôts clos.' } })
    } finally {
      sql(`delete from public.campagne where slug = '${b.json.slug as string}'`)
    }
  })

  it('409 troisième lancement déjà consommé', async () => {
    sql(`update public.campagne set lancements = 3 where id = '${campagneId}'`)
    try {
      expect((await envoyer('POST', chemin, boss.cookie, corps())).json.message).toBe('Les trois lancements de la délibération sont consommés.')
    } finally {
      sql(`update public.campagne set lancements = 0 where id = '${campagneId}'`)
    }
    expect(secrets()).toBe(0)
  })

  it('409 une seconde clé tant que la première n\'est pas rangée : deux lancements en parallèle, un seul passe', async () => {
    // Probabiliste : deux requêtes simultanées ne se chevauchent pas à coup sûr ; le refus déterministe est prouvé en pgTAP
    // (14_lancement.test.sql, « clé déjà présente »), la sérialisation par le for update de la campagne.
    const [a, b] = await Promise.all([
      envoyer('POST', chemin, boss.cookie, corps({ plafond_usd: 2.5, cle: `sk-ant-api03-${CANARI}1111` })),
      envoyer('POST', chemin, boss.cookie, corps({ plafond_usd: 2.5, cle: `sk-ant-api03-${CANARI}2222` })),
    ])
    expect([a.statut, b.statut].sort()).toEqual([200, 409])
    expect([a, b].find((r) => r.statut === 409)!.json.message).toBe('Une clé est déjà rangée : la délibération est en cours.')
    expect(secrets()).toBe(1)
    expect(ligne(`select lancements from public.campagne where id = '${campagneId}'`)).toBe('1')
    expect(ligne(`select count(*) from public.engagement where campagne_id = '${campagneId}'`)).toBe('1')
    await attendre(() => appelsJury.length > 0)
    appelsJury.length = 0
    // Retour à l'état de départ pour la suite.
    sql(`select public.effacer_cle_boss('${campagneId}')`)
    sql(`delete from public.engagement where campagne_id = '${campagneId}'`)
    sql(`delete from public.audit where depot_id in (select d.id from public.depot d join public.participation p on p.id = d.participation_id where p.campagne_id = '${campagneId}')`)
    sql(`alter table public.campagne disable trigger campagne_transition`)
    sql(`update public.campagne set statut = 'ouverte', lancements = 0, plafond_usd = null where id = '${campagneId}'`)
    sql(`alter table public.campagne enable trigger campagne_transition`)
    expect(etat()).toBe('0:ouverte:-')
  })

  it('409 moins de 2 jours avant les résultats, sans rien écrire', async () => {
    sql(`update public.campagne set date_resultats = now() + interval '47 hours' where id = '${campagneId}'`)
    try {
      expect((await envoyer('POST', chemin, boss.cookie, corps())).statut).toBe(409)
    } finally {
      sql(`update public.campagne set date_resultats = now() + interval '5 days' where id = '${campagneId}'`)
    }
    expect(etat()).toBe('0:ouverte:-')
  })
})

describe('lancement réussi, clé déjà présente, relance', () => {
  it('range la clé, crée les audits, appelle le jury, ne montre que les 4 derniers caractères', async () => {
    const r = await envoyer('POST', chemin, boss.cookie, corps({ plafond_usd: 2.5 }))
    expect(r).toEqual({ statut: 200, json: { cle_fin: '0123', lancements: 1 } })
    expect(etat()).toBe('1:deliberation:0123')
    expect(secrets()).toBe(1)
    expect(ligne(`select count(*) from public.audit a join public.depot d on d.id = a.depot_id join public.participation p on p.id = d.participation_id where p.campagne_id = '${campagneId}' and a.statut = 'a_envoyer'`)).toBe('4')
    expect(ligne(`select version from public.engagement where campagne_id = '${campagneId}'`)).toBe(ENGAGEMENTS_VERSION)
    expect(ligne(`select plafond_usd from public.campagne where id = '${campagneId}'`)).toBe('2.5')
    // Le jury est réveillé, sans corps.
    await attendre(() => appelsJury.length > 0)
    expect(appelsJury).toHaveLength(1)
    expect(appelsJury[0]!.corps).toBe('')
    expect(String(appelsJury[0]!.autorisation)).toMatch(/^Bearer secret-du-jury-de-test-/)
    // La page du Boss lit cle_fin, jamais la clé ; l'estimation dit que le jury délibère.
    const page = await lire(`/api/boss/${slug}`, boss.cookie)
    expect(page.json).toMatchObject({ statut: 'deliberation', lancements: 1, cle_fin: '0123', plafond_usd: 2.5 })
    expect((await lire(`/api/boss/${slug}/estimation`, boss.cookie)).json).toEqual({ disponible: false, raison: 'Le jury délibère : une clé est déjà rangée.' })
  })

  it('409 une seconde clé tant que la première est rangée', async () => {
    const r = await envoyer('POST', chemin, boss.cookie, corps({ cle: `sk-ant-api03-${CANARI}9999` }))
    expect(r).toMatchObject({ statut: 409, json: { message: 'Une clé est déjà rangée : la délibération est en cours.' } })
    expect(etat()).toBe('1:deliberation:0123')
  })

  it('relance après effacement de la clé : estimation disponible avec le déjà dépensé, plafond cumulé, deuxième lancement', async () => {
    sql(`select public.effacer_cle_boss('${campagneId}')`)
    expect(etat()).toBe('1:deliberation:-')
    sql(`update public.audit set cout_usd = 0.5 where id = (select a.id from public.audit a join public.depot d on d.id = a.depot_id join public.participation p on p.id = d.participation_id where p.campagne_id = '${campagneId}' limit 1)`)
    // Dépensé 0,50 $ ; pire cas 4 × 0,55 $ = 2,20 $ (le coût payé d'un audit ne le sort pas du pire cas tant qu'il n'est pas termine).
    expect((await lire(`/api/boss/${slug}/estimation`, boss.cookie)).json).toEqual({ disponible: true, pire_cas_usd: 2.2, depense_usd: 0.5 })
    expect((await envoyer('POST', chemin, boss.cookie, corps({ plafond_usd: 2.5 }))).json.message).toBe('Plafond insuffisant : il manque 0,20 $.')
    expect(await envoyer('POST', chemin, boss.cookie, corps({ plafond_usd: 2.7, cle: `sk-ant-api03-${CANARI}4567` })))
      .toEqual({ statut: 200, json: { cle_fin: '4567', lancements: 2 } })
    expect(etat()).toBe('2:deliberation:4567')
  })

  it('estimation : trois lancements faits, puis rien à relancer', async () => {
    sql(`select public.effacer_cle_boss('${campagneId}')`)
    sql(`update public.campagne set lancements = 3 where id = '${campagneId}'`)
    expect((await lire(`/api/boss/${slug}/estimation`, boss.cookie)).json).toEqual({ disponible: false, raison: 'Les trois lancements de la délibération sont consommés.' })
  })
})

describe('limite de débit', () => {
  it('429 au onzième essai depuis la même adresse', async () => {
    const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`
    const statuts: number[] = []
    for (let i = 0; i < 11; i++) statuts.push((await envoyer('POST', chemin, boss.cookie, corps({ plafond_usd: 0 }), ip)).statut)
    expect(statuts).toEqual([...Array(10).fill(400), 429])
  })
})

describe('la clé factice n\'apparaît nulle part', () => {
  it('ni dans une réponse du site, ni dans son journal, ni dans les journaux de la pile locale, même en 503', async () => {
    // Limite de débit en panne (secret trop court) : 503, avec la clé factice dans le corps.
    const enPanne = await demarrer(3926, { NUXT_SECRET_DEBIT: 'trop-court' })
    try {
      const r = await fetch(enPanne.url + chemin, { method: 'POST', headers: { 'content-type': 'application/json', cookie: boss.cookie }, body: JSON.stringify(corps()) })
      expect(r.status).toBe(503)
      reponses.push(await r.text())
    } finally {
      enPanne.arreter()
    }
    expect(enPanne.journal()).toContain('NUXT_SECRET_DEBIT')
    expect(enPanne.journal()).not.toContain(CANARI)
    expect(reponses.length).toBeGreaterThan(30)
    for (const texte of reponses) expect(texte).not.toContain(CANARI)
    expect(serveur.journal()).not.toContain(CANARI)
    const conteneurs = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { stdio: 'pipe' }).toString().split('\n').filter((n) => n.endsWith('_code-tank-site'))
    expect(conteneurs.length).toBeGreaterThan(0)
    for (const nom of conteneurs) {
      // Postgres, GoTrue et PostgREST écrivent sur stderr : les deux flux.
      const journal = spawnSync('docker', ['logs', nom], { maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' })
      expect(journal.status, nom).toBe(0)
      expect(journal.stdout + journal.stderr, nom).not.toContain(CANARI)
    }
  })
})

async function attendre(condition: () => boolean) {
  for (let i = 0; i < 50 && !condition(); i++) await new Promise((r) => setTimeout(r, 100))
}
