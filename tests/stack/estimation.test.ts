// Pire cas de la délibération (story 4.2) contre la pile locale et le serveur construit : 404 hors Boss, « pas encore »
// (dépôts pas clos, réception en attente), pire cas en dollars une fois les dépôts clos, refus 42501 par /rest/v1/rpc.
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API, connexion, demarrer, nettoyer, sql, statut, utilisateur } from './aide'

let serveur: Awaited<ReturnType<typeof demarrer>>
const ids: string[] = []
const jour = 86_400_000

async function envoyer(methode: string, chemin: string, cookie: string, corps: unknown = {}) {
  const r = await fetch(serveur.url + chemin, {
    method: methode,
    headers: { 'x-forwarded-for': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`, 'content-type': 'application/json', cookie },
    body: JSON.stringify(corps),
  })
  return { statut: r.status, json: await r.json() as Record<string, unknown> }
}
const lire = async (chemin: string, cookie?: string) => {
  const r = await fetch(serveur.url + chemin, { headers: cookie ? { cookie } : {} })
  return { statut: r.status, json: await r.json() as Record<string, unknown> }
}
const ligne = (requete: string) => sql(requete).toString().split('\n')[2]!.trim()

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
let participation: string

beforeAll(async () => {
  serveur = await demarrer(3919, { NUXT_SECRET_DEBIT: 'secret-debit-de-test-' + randomBytes(16).toString('hex') })
  sql('update public.reglage set mode_acces = \'ouvert\'')
  boss = await membre()
  autre = await membre()
  const r = await envoyer('POST', '/api/boss', boss.cookie, {
    titre: 'Estimation ' + randomBytes(3).toString('hex'), theme: 'Un minuteur', brief: 'Écris un minuteur.', langages: ['Go'],
    visibilite: 'publique', role_boss: 'juge', max_participants: 5,
    ouverture_inscriptions: new Date(Date.now() - 60_000).toISOString(),
    cloture_depot: new Date(Date.now() + 10 * jour).toISOString(),
    date_resultats: new Date(Date.now() + 20 * jour).toISOString(),
  })
  expect(r.statut).toBe(200)
  slug = r.json.slug as string
  expect((await envoyer('POST', `/api/boss/${slug}/ouverture`, boss.cookie)).statut).toBe(200)
  campagneId = ligne(`select id from public.campagne where slug = '${slug}'`)
  // Un candidat inscrit (par SQL : ce test ne porte pas sur l'inscription) avec un dépôt de 100 000 tokens estimés.
  participation = ligne(`insert into public.participation (campagne_id, compte_id, connaissance_envoi_le) values ('${campagneId}', '${autre.u.id}', now()) returning id`)
  sql(`insert into public.depot (participation_id, chemin_stockage, sha256, nb_fichiers, nb_tokens_estime, presentation, droit_declare_le)
    values ('${participation}', '${campagneId}/${participation}/${randomUUID()}.zip', repeat('a', 64), 1, 100000, 'Présentation', now())`)
})

afterAll(async () => {
  serveur?.arreter()
  if (ids.length) sql(`delete from public.campagne where boss_id in (${ids.map((i) => `'${i}'`).join(', ')})`)
  await nettoyer()
})

describe('GET /api/boss/[slug]/estimation', () => {
  it('404 sans session et pour un autre compte', async () => {
    expect((await lire(`/api/boss/${slug}/estimation`)).statut).toBe(404)
    expect((await lire(`/api/boss/${slug}/estimation`, autre.cookie)).statut).toBe(404)
  })

  it('pas encore tant que les dépôts ne sont pas clos', async () => {
    const r = await lire(`/api/boss/${slug}/estimation`, boss.cookie)
    expect(r).toEqual({ statut: 200, json: { disponible: false, raison: 'Les dépôts ne sont pas encore clos.' } })
  })

  it('dépôts clos : pas encore avec une réception en attente, puis le pire cas', async () => {
    sql(`update public.campagne set cloture_depot = now() - interval '1 minute', date_resultats = now() + interval '5 days' where id = '${campagneId}'`)
    sql(`insert into public.reception (participation_id, chemin_stockage, presentation, droit_declare_le)
      values ('${participation}', '${campagneId}/${participation}/${randomUUID()}.zip', 'Présentation', now())`)
    expect((await lire(`/api/boss/${slug}/estimation`, boss.cookie)).json)
      .toEqual({ disponible: false, raison: 'Un dépôt est encore en cours de contrôle.' })
    sql(`delete from public.reception where participation_id = '${participation}'`)
    // 4 jurés × (100 000 × 8 $ + 15 000 × 20 $) / 1 M / 2 = 2,20 $.
    expect(await lire(`/api/boss/${slug}/estimation`, boss.cookie)).toEqual({ statut: 200, json: { disponible: true, pire_cas_usd: 2.2 } })
  })

  it('par /rest/v1/rpc, un autre compte est refusé en 42501', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/estimer_pire_cas`, {
      method: 'POST',
      headers: { apikey: statut.ANON_KEY, authorization: `Bearer ${autre.jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_campagne: campagneId }),
    })
    expect(r.status).toBe(403)
    expect((await r.json() as { code: string }).code).toBe('42501')
  })
})
