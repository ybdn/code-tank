// Clôture, fin et relance de la délibération (story 4.6) contre la pile locale et le serveur construit, avec une clé factice et
// un faux count_tokens (aucun appel réel à Anthropic) : cron des clés de plus de 48 h, relance de bout en bout (seuls les audits
// en échec repartent, plafond cumulé), troisième lancement consommé, route de fin (404, 415, 409, 200).
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ENGAGEMENTS_VERSION } from '../../shared/utils/engagements'
import { demarrer, nettoyer, sql, connexion, utilisateur } from './aide'

const CLE = 'sk-ant-api03-FAUSSECLECLOTURE'
const SECRET_CRON = 'secret-cron-de-test-' + randomBytes(16).toString('hex')
const jour = 86_400_000
let serveur: Awaited<ReturnType<typeof demarrer>>
let fauxAnthropic: Server
let fauxJury: Server
const ids: string[] = []

const ouvrir = (serveurHttp: Server) => new Promise<number>((ok) => serveurHttp.listen(0, '127.0.0.1', () => ok((serveurHttp.address() as AddressInfo).port)))
const ligne = (requete: string) => sql(requete).toString().split('\n')[2]!.trim()
// vault.secrets appartient à supabase_admin : lui seul date une clé.
const dater = (requete: string) => execFileSync('docker', ['exec', 'supabase_db_code-tank-site', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-c', requete], { stdio: 'pipe' })

async function envoyer(methode: string, chemin: string, cookie: string, corps: unknown = {}, type = 'application/json') {
  const r = await fetch(serveur.url + chemin, {
    method: methode, headers: { 'x-forwarded-for': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`, 'content-type': type, cookie }, body: JSON.stringify(corps),
  })
  return { statut: r.status, json: await r.json() as Record<string, unknown> }
}
const lire = async (chemin: string, cookie: string) => (await (await fetch(serveur.url + chemin, { headers: { cookie } })).json()) as Record<string, unknown>
const cron = (autorisation = `Bearer ${SECRET_CRON}`) => fetch(serveur.url + '/api/cron/conservation', { headers: { authorization: autorisation } })
const lancer = (plafond: number, fin: string) => envoyer('POST', lancement, boss.cookie, { plafond_usd: plafond, cle: CLE + fin, engagements: [true, true, true], version: ENGAGEMENTS_VERSION })

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
let lancement: string
let fin: string

beforeAll(async () => {
  fauxAnthropic = createServer((req, res) => { req.resume(); req.on('end', () => res.writeHead(200, { 'content-type': 'application/json' }).end('{"input_tokens":8}')) })
  fauxJury = createServer((req, res) => { req.resume(); req.on('end', () => res.writeHead(202).end()) })
  const [portAnthropic, portJury] = [await ouvrir(fauxAnthropic), await ouvrir(fauxJury)]
  serveur = await demarrer(3927, {
    NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex'),
    NUXT_ANTHROPIC_URL: `http://127.0.0.1:${portAnthropic}/v1/messages/count_tokens`,
    NUXT_JURY_URL: `http://127.0.0.1:${portJury}/api/jury`,
    NUXT_JURY_SECRET: 'secret-du-jury-de-test-' + randomBytes(16).toString('hex'),
    CRON_SECRET: SECRET_CRON,
  })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  boss = await membre()
  autre = await membre()
  const r = await envoyer('POST', '/api/boss', boss.cookie, {
    titre: 'Clôture ' + randomBytes(3).toString('hex'), theme: 'Un minuteur', brief: 'Écris un minuteur.', langages: ['Go'],
    visibilite: 'publique', role_boss: 'juge', max_participants: 5,
    ouverture_inscriptions: new Date(Date.now() - 60_000).toISOString(),
    cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
    date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
  })
  expect(r.statut).toBe(200)
  slug = r.json.slug as string
  expect((await envoyer('POST', `/api/boss/${slug}/ouverture`, boss.cookie)).statut).toBe(200)
  campagneId = ligne(`select id from public.campagne where slug = '${slug}'`)
  lancement = `/api/boss/${slug}/lancement`
  fin = `/api/boss/${slug}/fin`
  // Un dépôt de 100 000 tokens estimés : 0,55 $ par audit, pire cas 2,20 $.
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
  await nettoyer()
})

const etat = () => ligne(`select lancements || ':' || statut || ':' || coalesce(cle_fin, '-') from public.campagne where id = '${campagneId}'`)
const secrets = () => Number(ligne(`select count(*) from vault.secrets where name = 'cle_boss_${campagneId}'`))
const audits = () => ligne(`select string_agg(a.statut, ',' order by a.jure) from public.audit a join public.depot d on d.id = a.depot_id join public.participation p on p.id = d.participation_id where p.campagne_id = '${campagneId}'`)
const sur = (jure: string, requete: string) => sql(`update public.audit set ${requete} where jure = '${jure}' and depot_id in (select d.id from public.depot d join public.participation p on p.id = d.participation_id where p.campagne_id = '${campagneId}')`)

describe('POST /api/boss/[slug]/fin : refus', () => {
  it('404 sans session et pour un autre compte ; 415 hors JSON ; 409 hors délibération', async () => {
    expect((await envoyer('POST', fin, '')).statut).toBe(404)
    expect((await envoyer('POST', fin, autre.cookie)).statut).toBe(404)
    expect((await envoyer('POST', fin, boss.cookie, {}, 'text/plain')).statut).toBe(415)
    expect(await envoyer('POST', fin, boss.cookie)).toMatchObject({ statut: 409, json: { message: 'La campagne n\'est pas en délibération.' } })
  })
})

describe('cron : clôture des clés de plus de 48 h', () => {
  it('refuse sans le secret du planificateur (404) et laisse une clé fraîche', async () => {
    expect((await lancer(2.5, '0123')).json).toEqual({ cle_fin: '0123', lancements: 1 })
    expect((await cron('Bearer faux')).status).toBe(404)
    expect(await (await cron()).json()).toEqual({ cles_cloturees: 0, echecs: 0 })
    expect(secrets()).toBe(1)
    // Tant que la clé est rangée, le Boss ne peut pas terminer : le jury travaille.
    expect(await envoyer('POST', fin, boss.cookie)).toMatchObject({ statut: 409, json: { message: expect.stringContaining('Le jury travaille encore') } })
  })

  it('une clé de 49 h : audits abandonnés (un lot en cours aussi), clé effacée, la campagne attend le Boss', async () => {
    sur('sudo', `statut = 'en_cours', batch_id = 'lot'`)
    dater(`update vault.secrets set created_at = now() - interval '49 hours' where name = 'cle_boss_${campagneId}'`)
    expect(await (await cron()).json()).toEqual({ cles_cloturees: 1, echecs: 0 })
    expect(secrets()).toBe(0)
    expect(etat()).toBe('1:deliberation:-')
    expect(audits()).toBe('echec,echec,echec,echec')
    expect((await lire(`/api/boss/${slug}`, boss.cookie))).toMatchObject({ statut: 'deliberation', cle_fin: null, lancements: 1 })
    expect(await (await cron()).json()).toEqual({ cles_cloturees: 0, echecs: 0 })
  })
})

describe('relance de bout en bout', () => {
  it('seuls les audits en échec repartent, le plafond porte sur le cumul, le troisième lancement est le dernier', async () => {
    expect((await lire(`/api/boss/${slug}/estimation`, boss.cookie))).toEqual({ disponible: true, pire_cas_usd: 2.2, depense_usd: 0 })
    expect((await lancer(2.5, '4567')).json).toEqual({ cle_fin: '4567', lancements: 2 })
    expect(audits()).toBe('a_envoyer,a_envoyer,a_envoyer,a_envoyer')
    // Trois audits terminent (0,40 $ chacun), le dernier échoue après 0,10 $ : dépensé 1,30 $.
    for (const j of ['lint', 'pitch', 'refacto']) sur(j, `statut = 'termine', cout_usd = 0.4`)
    sur('sudo', `statut = 'echec', cout_usd = 0.1`)
    sql(`select public.cloturer_deliberation('${campagneId}')`)
    expect(secrets()).toBe(0)
    expect(etat()).toBe('2:deliberation:-')
    expect((await lire(`/api/boss/${slug}/estimation`, boss.cookie))).toEqual({ disponible: true, pire_cas_usd: 0.55, depense_usd: 1.3 })
    expect((await lancer(1.8, '89ab')).json.message).toBe('Plafond insuffisant : il manque 0,05 $.')
    expect((await lancer(1.85, '89ab')).json).toEqual({ cle_fin: '89ab', lancements: 3 })
    expect(audits()).toBe('termine,termine,termine,a_envoyer')
    sur('sudo', `statut = 'echec'`)
    sql(`select public.cloturer_deliberation('${campagneId}')`)
    expect(etat()).toBe('3:deliberation:-')
    // Trois lancements consommés : plus de relance, seul « Terminer » reste.
    expect((await lire(`/api/boss/${slug}/estimation`, boss.cookie))).toEqual({ disponible: false, raison: 'Les trois lancements de la délibération sont consommés.' })
    expect((await lancer(9, 'cdef')).statut).toBe(409)
    expect(secrets()).toBe(0)
  })

  it('terminer : prete, l\'audit en échec reste en échec, plus rien ne se termine', async () => {
    expect(await envoyer('POST', fin, boss.cookie)).toEqual({ statut: 200, json: { statut: 'prete' } })
    expect(etat()).toBe('3:prete:-')
    expect(audits()).toBe('termine,termine,termine,echec')
    expect((await envoyer('POST', fin, boss.cookie)).statut).toBe(409)
  })
})
