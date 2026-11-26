// Suivi de la délibération et e-mail de fin (story 4.7) contre la pile locale et le serveur construit, avec un faux jury et un
// faux serveur SMTP local (aucun e-mail réel) : route d'actualisation (404, 415, 409, limite d'une fois par minute par campagne,
// progression), constat de la fin par l'écran du Boss et par le cron, un seul e-mail pour des constats simultanés.
// shortcut: le test de concurrence est probabiliste (requêtes en parallèle) ; la preuve déterministe est dans 17_suivi.test.sql.
import { createServer, type Server } from 'node:http'
import { type AddressInfo, createServer as serveurTcp, type Server as ServeurTcp } from 'node:net'
import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demarrer, nettoyer, sql, connexion, utilisateur } from './aide'

const SECRET_CRON = 'secret-cron-de-test-' + randomBytes(16).toString('hex')
const SITE = 'https://code-tank.test'
const jour = 86_400_000
let serveur: Awaited<ReturnType<typeof demarrer>>
let fauxJury: Server
let fauxSmtp: ServeurTcp
let appelsJury = 0
const courriels: { destinataires: string[]; message: string }[] = []
const ids: string[] = []

const ouvrir = (s: Server | ServeurTcp) => new Promise<number>((ok) => s.listen(0, '127.0.0.1', () => ok((s.address() as AddressInfo).port)))
const ligne = (requete: string) => sql(requete).toString().split('\n')[2]!.trim()
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Serveur SMTP minimal : il accepte tout et garde chaque message (sans TLS, comme nodemailer l'admet pour 127.0.0.1).
function smtp() {
  return serveurTcp((s) => {
    let tampon = ''
    let donnees = false
    let courriel = { destinataires: [] as string[], message: '' }
    s.write('220 faux\r\n')
    s.on('data', (d) => {
      tampon += d.toString('latin1')
      let i
      while ((i = tampon.indexOf('\r\n')) >= 0) {
        const l = tampon.slice(0, i)
        tampon = tampon.slice(i + 2)
        if (donnees) {
          if (l === '.') {
            donnees = false
            courriels.push(courriel)
            courriel = { destinataires: [], message: '' }
            s.write('250 ok\r\n')
          } else courriel.message += (l.startsWith('..') ? l.slice(1) : l) + '\n'
          continue
        }
        const commande = l.slice(0, 4).toUpperCase()
        if (commande === 'EHLO' || commande === 'HELO') s.write('250 faux\r\n')
        else if (commande === 'RCPT') { courriel.destinataires.push(l.replace(/^RCPT TO:\s*<?([^>]*)>?.*$/i, '$1')); s.write('250 ok\r\n') }
        else if (commande === 'DATA') { donnees = true; s.write('354 vas-y\r\n') }
        else if (commande === 'QUIT') s.end('221 au revoir\r\n')
        else s.write('250 ok\r\n')
      }
    })
    s.on('error', () => {})
  })
}

// En-têtes dépliés, objet (mots encodés RFC 2047) et corps (quoted-printable) décodés en UTF-8.
const octets = (t: string) => Buffer.from(t.replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8')
function lireCourriel(message: string) {
  const [entete, ...corps] = message.split('\n\n')
  const enTetes = entete!.replace(/\n[ \t]+/g, ' ')
  const brut = /^Subject: (.*)$/m.exec(enTetes)?.[1] ?? ''
  const objet = brut.replace(/=\?UTF-8\?([QB])\?([^?]*)\?=\s*/gi, (_, m: string, v: string) =>
    m.toUpperCase() === 'B' ? Buffer.from(v, 'base64').toString('utf8') : octets(v.replaceAll('_', ' ')))
  const texte = /quoted-printable/i.test(enTetes) ? octets(corps.join('\n\n').replace(/=\n/g, '')) : corps.join('\n\n')
  return { enTetes, objet: objet.trim(), texte }
}

async function envoyer(methode: string, chemin: string, cookie: string, corps: unknown = {}, type = 'application/json') {
  const r = await fetch(serveur.url + chemin, {
    method: methode, headers: { 'x-forwarded-for': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`, 'content-type': type, cookie }, body: JSON.stringify(corps),
  })
  return { statut: r.status, json: await r.json() as Record<string, unknown> }
}
const lire = async (chemin: string, cookie: string) => (await fetch(serveur.url + chemin, { headers: { cookie } })).text()
const cron = () => fetch(serveur.url + '/api/cron/conservation', { headers: { authorization: `Bearer ${SECRET_CRON}` } }).then((r) => r.json())

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
let titre: string
let campagneId: string
let actualisation: string

beforeAll(async () => {
  fauxJury = createServer((req, res) => { appelsJury++; req.resume(); req.on('end', () => res.writeHead(202).end()) })
  fauxSmtp = smtp()
  const [portJury, portSmtp] = [await ouvrir(fauxJury), await ouvrir(fauxSmtp)]
  serveur = await demarrer(3928, {
    NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex'),
    NUXT_JURY_URL: `http://127.0.0.1:${portJury}/api/jury`,
    NUXT_JURY_SECRET: 'secret-du-jury-de-test-' + randomBytes(16).toString('hex'),
    NUXT_SITE_URL: SITE,
    NUXT_SMTP_HOST: '127.0.0.1',
    NUXT_SMTP_PORT: String(portSmtp),
    CRON_SECRET: SECRET_CRON,
  })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  boss = await membre()
  autre = await membre()
  titre = 'Suivi ' + randomBytes(3).toString('hex')
  const r = await envoyer('POST', '/api/boss', boss.cookie, {
    titre, theme: 'Un minuteur', brief: 'Écris un minuteur.', langages: ['Go'],
    visibilite: 'publique', role_boss: 'juge', max_participants: 5,
    ouverture_inscriptions: new Date(Date.now() - 60_000).toISOString(),
    cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
    date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
  })
  expect(r.statut).toBe(200)
  slug = r.json.slug as string
  expect((await envoyer('POST', `/api/boss/${slug}/ouverture`, boss.cookie)).statut).toBe(200)
  campagneId = ligne(`select id from public.campagne where slug = '${slug}'`)
  actualisation = `/api/boss/${slug}/actualisation`
  const participation = ligne(`insert into public.participation (campagne_id, compte_id, connaissance_envoi_le) values ('${campagneId}', '${autre.u.id}', now()) returning id`)
  const depot = ligne(`insert into public.depot (participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, presentation, droit_declare_le)
    values ('${participation}', '${campagneId}/${participation}/${crypto.randomUUID()}.zip', repeat('a', 64), 1, 100000, 'Présentation', now()) returning id`)
  sql(`insert into public.audit (depot_id, jure, statut, cout_usd) values ('${depot}', 'sudo', 'termine', 0.4), ('${depot}', 'refacto', 'termine', 0.35),
    ('${depot}', 'lint', 'echec', 0.1), ('${depot}', 'pitch', 'en_cours', null)`)
})

afterAll(async () => {
  serveur?.arreter()
  fauxJury?.close()
  fauxSmtp?.close()
  if (ids.length) sql(`delete from public.campagne where boss_id in (${ids.map((i) => `'${i}'`).join(', ')})`)
  await nettoyer()
})

describe('POST /api/boss/[slug]/actualisation', () => {
  it('404 sans session et pour un autre compte ; 415 hors JSON ; 409 hors délibération', async () => {
    expect((await envoyer('POST', actualisation, '')).statut).toBe(404)
    expect((await envoyer('POST', actualisation, autre.cookie)).statut).toBe(404)
    expect((await envoyer('POST', actualisation, boss.cookie, {}, 'text/plain')).statut).toBe(415)
    expect(await envoyer('POST', actualisation, boss.cookie)).toMatchObject({ statut: 409, json: { message: 'La campagne n\'est pas en délibération.' } })
    expect(appelsJury).toBe(0)
  })

  it('appelle le jury une fois par minute au plus par campagne (adresses différentes) et rend la progression', async () => {
    sql(`update public.campagne set statut = 'deliberation', cle_fin = 'ABCD' where id = '${campagneId}'`)
    const progression = { termines: 2, en_cours: 1, echecs: 1, a_envoyer: 0, cout_usd: 0.85 }
    expect(await envoyer('POST', actualisation, boss.cookie)).toEqual({ statut: 200, json: { etat: 'lance', progression } })
    expect(appelsJury).toBe(1)
    // Double clic, autre onglet ou autre adresse : pas d'appel, pas d'erreur.
    expect(await envoyer('POST', actualisation, boss.cookie)).toEqual({ statut: 200, json: { etat: 'attente', progression } })
    expect(appelsJury).toBe(1)
    // La minute écoulée (fenêtre vidée), le jury est rappelé.
    sql(`delete from public.debit where action = 'actualisation'`)
    expect((await envoyer('POST', actualisation, boss.cookie)).json.etat).toBe('lance')
    expect(appelsJury).toBe(2)
  })
})

describe('e-mail « délibération terminée »', () => {
  it('constats simultanés (écran du Boss et cron) : un seul e-mail, au Boss, sans lien de pistage ; l\'adresse ne sort pas', async () => {
    expect(await cron()).toMatchObject({ fins_prevenues: 0 })
    expect(courriels).toHaveLength(0)
    sql(`update public.campagne set statut = 'prete' where id = '${campagneId}'`)
    const [pages, crons] = await Promise.all([
      Promise.all([1, 2, 3].map(() => lire(`/api/boss/${slug}`, boss.cookie))),
      Promise.all([cron(), cron()]),
    ])
    for (let i = 0; i < 50 && courriels.length === 0; i++) await attendre(100)
    await attendre(1000)
    expect(courriels).toHaveLength(1)
    expect(crons.reduce((n, c) => n + (c.fins_prevenues as number), 0)).toBeLessThanOrEqual(1)
    expect(courriels[0]!.destinataires).toEqual([boss.u.email])
    const { enTetes, objet, texte } = lireCourriel(courriels[0]!.message)
    expect(enTetes).toMatch(/^From: .*<code-tank@ybdn\.io>/m)
    expect(objet).toBe(`Code Tank — ${titre} : la délibération est terminée`)
    expect(texte).toContain(`ta campagne « ${titre} »`)
    expect(texte.match(/https?:\/\/\S+/g)).toEqual([`${SITE}/boss/${slug}`, SITE])
    expect(texte).not.toMatch(/utm_|[?&]\w+=/)
    expect(ligne(`select fin_prevenue_le is not null from public.campagne where id = '${campagneId}'`)).toBe('t')
    for (const p of pages) expect(p).not.toContain(boss.u.email)
    expect(serveur.journal()).not.toContain(boss.u.email)
    // Plus rien ensuite : ni l'écran, ni le cron.
    await lire(`/api/boss/${slug}`, boss.cookie)
    expect(await cron()).toMatchObject({ fins_prevenues: 0 })
    await attendre(500)
    expect(courriels).toHaveLength(1)
  })
})
