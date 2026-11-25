// Socle contre la pile locale : le site construit répond, et la tâche planifiée reste fermée sans son secret.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demarrer } from './aide'

let serveur: Awaited<ReturnType<typeof demarrer>>
beforeAll(async () => (serveur = await demarrer(3911)))
afterAll(() => serveur?.arreter())

describe('socle', () => {
  it('l\'accueil répond avec l\'accroche', async () => {
    const r = await fetch(serveur.url + '/')
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('Affronte notre jury.')
  })

  it('le cron sans secret répond 404', async () => {
    expect((await fetch(serveur.url + '/api/cron/conservation')).status).toBe(404)
    expect((await fetch(serveur.url + '/api/cron/conservation', { headers: { authorization: 'Bearer faux' } })).status).toBe(404)
  })
})
