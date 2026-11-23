// Tâches de conservation (GET /api/cron/conservation) contre la pile locale : les dates reculent par la clé de service
// (et par SQL pour les objets du stockage), le serveur Nuxt construit tourne avec CRON_SECRET.
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anon, campagne, candidat, demarrer, inscrire, nettoyer, organisateur, sql, statut, zip } from './aide'

const MAIL = statut.MAILPIT_URL as string
const SMTP = { NUXT_SMTP_HOST: '127.0.0.1', NUXT_SMTP_PORT: '54425' }
const SECRET = 'cron-' + randomBytes(20).toString('hex')
let serveur: Awaited<ReturnType<typeof demarrer>>
const stockage = () => admin.storage.from('depots')
const jours = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const mois = (n: number) => jours(n * 31)
const sensibles: string[] = [] // tout ce qui ne doit jamais apparaître dans une réponse ni dans le journal

const cron = async (base = serveur.url, secret: string | null = SECRET) => {
  const r = await fetch(`${base}/api/cron/conservation`, { headers: secret === null ? {} : { authorization: `Bearer ${secret}` } })
  const texte = await r.text()
  return { statut: r.status, texte, json: r.status === 200 ? JSON.parse(texte) : null }
}
type Bilan = Record<string, Record<string, number | string>>
const lancer = async (base?: string) => {
  const r = await cron(base)
  expect(r.statut).toBe(200)
  for (const s of sensibles) expect(r.texte).not.toContain(s)
  return r.json as Bilan
}

// Comptes, avec leurs données notées comme sensibles.
async function compte(etat: string, patch: Record<string, unknown> = {}) {
  const u = await candidat(etat)
  const { data } = await admin.from('compte').select('pseudo').eq('id', u.id).single()
  sensibles.push(u.email, data!.pseudo, u.id)
  if (Object.keys(patch).length) expect((await admin.from('compte').update(patch).eq('id', u.id)).error).toBeNull()
  return u
}
const existe = async (id: string) => (await admin.from('compte').select('id').eq('id', id)).data!.length === 1
const ligne = async (id: string) => (await admin.from('compte').select('*').eq('id', id).single()).data!

async function recus(adresse: string, attendus: number) {
  for (let i = 0; i < 40; i++) {
    const { messages } = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${adresse}`)}`)).json()
    if (messages.length >= attendus) return Promise.all(messages.map(async (x: { ID: string }) => (await fetch(`${MAIL}/api/v1/message/${x.ID}`)).json()))
    await new Promise((r) => setTimeout(r, 150))
  }
  return []
}
const uploader = async (chemin: string) => {
  const { error } = await stockage().upload(chemin, zip(), { contentType: 'application/zip' })
  expect(error).toBeNull()
}
const faire = async (r: PromiseLike<{ error: { message: string } | null }>) => expect((await r).error).toBeNull()

// Campagne publiée avec le dépôt noté 8 et le vote 6 du candidat donné, plus archive, réception et envoi orphelin dans son dossier.
async function publiee(u: { id: string }) {
  const c = await campagne('depot')
  const pid = await inscrire(c, u as Parameters<typeof inscrire>[1])
  const dossier = `${c.id}/${pid}`
  const [a, b, orphelin] = [`${dossier}/${crypto.randomUUID()}.zip`, `${dossier}/${crypto.randomUUID()}.zip`, `${dossier}/${crypto.randomUUID()}.zip`]
  await Promise.all([a, b, orphelin].map(uploader))
  const { data: depot } = await admin.from('depot').insert({
    participation_id: pid, chemin_stockage: a, sha256: 'ab'.repeat(32), taille_octets: 22, nb_fichiers: 1, nb_tokens: 1, presentation: 'x',
    type_code: 'open_source', licence_presente: true, declaration_code_le: jours(0),
  }).select('id').single()
  await faire(admin.from('audit').insert({ depot_id: depot!.id, jure: 'pitch', modele: 'm', version_consignes: 'v', statut: 'termine', resultat: { criteres: [{ cle: 'brief', note: 8, justification: 'j' }] } }))
  await faire(admin.from('reception').insert({ participation_id: pid, chemin_stockage: b, presentation: 'x', type_code: 'open_source', declaration_code_le: jours(0) }))
  for (const s of ['deliberation', 'prete']) await faire(admin.from('campagne').update({ statut: s as 'prete' }).eq('id', c.id))
  await faire(admin.from('vote_boss').insert({ participation_id: pid, note: 6, verrouille_le: jours(0) }))
  await faire(admin.from('campagne').update({ statut: 'publiee' }).eq('id', c.id))
  sensibles.push(c.id, pid, a, b, orphelin)
  return { c, pid, chemins: [a, b, orphelin] }
}

beforeAll(async () => {
  serveur = await demarrer(3420, { ...SMTP, CRON_SECRET: SECRET })
})
afterAll(async () => {
  serveur?.arreter()
  await nettoyer()
})

describe('accès à la route', () => {
  it('404 sans secret, avec un mauvais secret, et si le secret n\'est pas configuré ou trop court', async () => {
    expect((await cron(serveur.url, null)).statut).toBe(404)
    expect((await cron(serveur.url, 'mauvais')).statut).toBe(404)
    expect((await cron(serveur.url, SECRET + 'x')).statut).toBe(404)
    expect((await cron(serveur.url, '')).statut).toBe(404)
    const sans = await demarrer(3421, { ...SMTP, CRON_SECRET: '' })
    const court = await demarrer(3422, { ...SMTP, CRON_SECRET: 'court' })
    try {
      for (const secret of ['', 'court', null]) {
        expect((await cron(sans.url, secret)).statut).toBe(404)
        expect((await cron(court.url, secret)).statut).toBe(404)
      }
    } finally {
      sans.arreter()
      court.arreter()
    }
    expect((await cron()).statut).toBe(200)
  })
})

describe('tâches', () => {
  it('candidature refusée : part à 31 jours, reste à 29 ; un compte autorisé et l\'organisateur ne bougent pas', async () => {
    const recent = await compte('refuse', { etat_le: jours(29) })
    const vieux = await compte('refuse', { etat_le: jours(31) })
    const autorise = await compte('autorise', { etat_le: jours(400) })
    const orga = await organisateur()
    sensibles.push(orga.email, orga.id)
    await faire(admin.from('compte').update({ etat: 'refuse' }).eq('id', orga.id))
    await faire(admin.from('compte').update({ etat_le: jours(40), derniere_connexion_le: mois(30), prevenu_inactivite_le: jours(60) }).eq('id', orga.id))
    const b = await lancer()
    expect(Number(b.refuses!.supprimes)).toBeGreaterThanOrEqual(1)
    expect(await existe(vieux.id)).toBe(false)
    expect((await admin.auth.admin.getUserById(vieux.id)).data.user).toBeNull()
    expect(await existe(recent.id)).toBe(true)
    expect(await existe(autorise.id)).toBe(true)
    expect(await existe(orga.id)).toBe(true)
    expect((await admin.auth.admin.getUserById(orga.id)).data.user).not.toBeNull()
    expect((await recus(orga.email, 1))).toHaveLength(0)
  })

  it('envois abandonnés : l\'orpheline de 25 heures part, la récente et la référencée restent', async () => {
    const c = await campagne('depot')
    const u = await candidat()
    const pid = await inscrire(c, u)
    const dossier = `${c.id}/${pid}`
    const [reference, orpheline, recente] = [1, 2, 3].map((i) => `${dossier}/${i}-${crypto.randomUUID()}.zip`)
    await Promise.all([reference!, orpheline!, recente!].map(uploader))
    await faire(admin.from('reception').insert({ participation_id: pid, chemin_stockage: reference!, presentation: 'x', type_code: 'open_source', declaration_code_le: jours(0) }))
    sql(`update storage.objects set created_at = now() - interval '30 hours' where name = '${reference}'`)
    sql(`update storage.objects set created_at = now() - interval '25 hours' where name = '${orpheline}'`)
    sensibles.push(reference!, orpheline!, recente!)
    const b = await lancer()
    expect(Number(b.envois!.supprimes)).toBeGreaterThanOrEqual(1)
    expect((await stockage().exists(orpheline!)).data).toBe(false)
    expect((await stockage().exists(reference!)).data).toBe(true)
    expect((await stockage().exists(recente!)).data).toBe(true)
  })

  it('campagne publiée depuis 31 jours : archives effacées, statut archivee, classement et rapport lisibles ; à 29 jours rien ne bouge', async () => {
    const u = await candidat()
    const jeune = await candidat()
    const { c, pid, chemins } = await publiee(u)
    const autre = await publiee(jeune)
    await faire(admin.from('campagne').update({ publiee_le: jours(31) }).eq('id', c.id))
    await faire(admin.from('campagne').update({ publiee_le: jours(29) }).eq('id', autre.c.id))
    const b = await lancer()
    expect(Number(b.archives!.campagnes)).toBeGreaterThanOrEqual(1)
    for (const ch of chemins) expect((await stockage().exists(ch)).data).toBe(false)
    expect((await admin.from('campagne').select('statut').eq('id', c.id).single()).data?.statut).toBe('archivee')
    expect((await admin.from('depot').select('chemin_stockage').eq('participation_id', pid).single()).data?.chemin_stockage).toBeNull()
    expect((await admin.from('reception').select('id').eq('participation_id', pid)).data).toEqual([])
    const rang = (await anon().from('classement').select('score_claude, note_boss').eq('campagne_id', c.id)).data
    expect(rang).toHaveLength(1)
    expect(rang![0]).toMatchObject({ score_claude: 80, note_boss: 6 })
    expect((await u.client.from('rapport').select('id').eq('campagne_id', c.id)).data).toHaveLength(1)
    // L'autre campagne n'a pas bougé.
    expect((await admin.from('campagne').select('statut').eq('id', autre.c.id).single()).data?.statut).toBe('publiee')
    for (const ch of autre.chemins) expect((await stockage().exists(ch)).data).toBe(true)
  })

  it('liste d\'attente : e-mail de confirmation, confirmation par le candidat, effacement sans réponse', async () => {
    const aRelancer = await compte('liste_attente', { etat_le: mois(13), email_verifie_le: jours(900) })
    const recent = await compte('liste_attente', { etat_le: mois(6), email_verifie_le: jours(900) })
    const sansReponse = await compte('liste_attente', { etat_le: mois(14), attente_demandee_le: jours(31) })
    const dansLeDelai = await compte('liste_attente', { etat_le: mois(14), attente_demandee_le: jours(29) })
    const b = await lancer()
    expect(Number(b.attente!.demandes)).toBeGreaterThanOrEqual(1)
    const [mail] = await recus(aRelancer.email, 1)
    expect(mail.From.Address).toBe('code-tank@ybdn.io')
    expect(mail.Text).toContain(`${serveur.url}/compte`)
    expect(mail.Text).toContain('30 jours')
    expect(mail.HTML).toBe('')
    expect((await ligne(aRelancer.id)).attente_demandee_le).not.toBeNull()
    expect((await ligne(recent.id)).attente_demandee_le).toBeNull()
    expect(await recus(recent.email, 1)).toHaveLength(0)
    expect(await existe(sansReponse.id)).toBe(false)
    expect(await existe(dansLeDelai.id)).toBe(true)

    // Il confirme : la demande est soldée, il n'est ni relancé ni effacé, même plus tard.
    expect((await aRelancer.client.rpc('confirmer_attente')).error).toBeNull()
    expect((await ligne(aRelancer.id)).attente_demandee_le).toBeNull()
    await lancer()
    expect(await existe(aRelancer.id)).toBe(true)
    expect(await recus(aRelancer.email, 2)).toHaveLength(0)
    expect((await recent.client.rpc('confirmer_attente')).error).toBeNull() // il peut aussi confirmer avant qu'on le lui demande
    const autorise = await candidat()
    expect((await autorise.client.rpc('confirmer_attente')).error?.message).toContain('pas en liste d\'attente')
  })

  it('comptes sans adresse vérifiée : jamais avertis, supprimés ; liste d\'attente sans adresse utilisable effacée sans e-mail', async () => {
    const jamais31 = await compte('email_a_verifier', { cree_le: jours(31) })
    const jamais29 = await compte('email_a_verifier', { cree_le: jours(29) })
    const inactifNonVerifie = await compte('autorise', { derniere_connexion_le: mois(25) })
    const attenteNonVerifiee = await compte('liste_attente', { etat_le: mois(13) })
    const attenteJetable = await compte('liste_attente', { etat_le: mois(13), email_verifie_le: jours(900), email_contact: 'a@example.org,b@example.org' })
    const attenteJoignable = await compte('liste_attente', { etat_le: mois(13), email_verifie_le: jours(900) })
    const b = await lancer()
    expect(Number(b.non_verifies!.supprimes)).toBeGreaterThanOrEqual(2)
    expect(Number(b.attente!.sans_adresse)).toBeGreaterThanOrEqual(2)
    expect(await existe(jamais31.id)).toBe(false)
    expect(await existe(jamais29.id)).toBe(true)
    expect(await existe(inactifNonVerifie.id)).toBe(false)
    expect(await existe(attenteNonVerifiee.id)).toBe(false)
    expect(await existe(attenteJetable.id)).toBe(false)
    expect(await existe(attenteJoignable.id)).toBe(true)
    expect((await ligne(attenteJoignable.id)).attente_demandee_le).not.toBeNull()
    for (const u of [jamais31, jamais29, inactifNonVerifie, attenteNonVerifiee]) expect(await recus(u.email, 1)).toHaveLength(0)
    expect(await recus(attenteJoignable.email, 1)).toHaveLength(1)
  })

  it('inactivité : avertissement après 24 mois, une connexion l\'annule, sinon suppression avec la ligne du classement conservée', async () => {
    const aPrevenir = await compte('autorise', { derniere_connexion_le: mois(25), email_verifie_le: jours(900) })
    const nonVerifie = await compte('autorise', { derniere_connexion_le: mois(25) }) // adresse jamais vérifiée : suppression sans avertissement
    const revenu = await compte('autorise', { derniere_connexion_le: mois(25), email_verifie_le: jours(900), prevenu_inactivite_le: jours(10) })
    const actif = await compte('autorise', { email_verifie_le: jours(900) })
    const abandonne = await compte('autorise', { derniere_connexion_le: mois(25), email_verifie_le: jours(900), prevenu_inactivite_le: jours(31) })
    const { c, pid, chemins } = await publiee(abandonne)
    const b = await lancer()
    expect(Number(b.inactivite!.avertis)).toBeGreaterThanOrEqual(1)

    expect((await ligne(aPrevenir.id)).prevenu_inactivite_le).not.toBeNull()
    const [mail] = await recus(aPrevenir.email, 1)
    expect(mail.Text).toContain(`${serveur.url}/compte`)
    expect(mail.Text).not.toMatch(/score|classement : \d/i)
    expect(await existe(nonVerifie.id)).toBe(false)
    expect(await recus(nonVerifie.email, 1)).toHaveLength(0)
    expect((await ligne(actif.id)).prevenu_inactivite_le).toBeNull()
    expect(await recus(actif.email, 1)).toHaveLength(0)

    // Supprimé : compte, Auth, archives ; la ligne du classement reste, anonyme, avec ses scores.
    expect(await existe(abandonne.id)).toBe(false)
    expect((await admin.auth.admin.getUserById(abandonne.id)).data.user).toBeNull()
    for (const ch of chemins) expect((await stockage().exists(ch)).data).toBe(false)
    expect((await admin.from('participation').select('compte_id').eq('id', pid).single()).data?.compte_id).toBeNull()

    // Une connexion de l'avertis annule l'avertissement ; son compte reste.
    expect((await aPrevenir.client.rpc('noter_connexion')).error).toBeNull()
    expect((await ligne(aPrevenir.id)).prevenu_inactivite_le).toBeNull()
    expect((await revenu.client.rpc('noter_connexion')).error).toBeNull()
    await lancer()
    expect(await existe(aPrevenir.id)).toBe(true)
    expect(await existe(revenu.id)).toBe(true)
    await faire(admin.from('campagne').update({ publiee_le: jours(31) }).eq('id', c.id))
    await lancer()
    const rang = (await anon().from('classement').select('pseudo, score_claude, note_boss').eq('campagne_id', c.id)).data
    expect(rang).toEqual([{ pseudo: 'candidat supprimé', score_claude: 80, note_boss: 6 }])
  })

  it('bornes par exécution, puis deuxième exécution : tous les compteurs à zéro', async () => {
    // 10 001 lignes de débit, 501 envois abandonnés et 51 comptes refusés : chaque tâche s'arrête à sa borne.
    await faire(admin.from('debit').insert(Array.from({ length: 10_001 }, () => ({ empreinte: randomBytes(32).toString('hex'), action: 'borne', le: jours(2) }))))
    const prefixe = `bornes-${randomBytes(4).toString('hex')}`
    const noms = Array.from({ length: 501 }, (_, i) => `${prefixe}/${i}.zip`)
    for (let i = 0; i < noms.length; i += 25) await Promise.all(noms.slice(i, i + 25).map(uploader))
    sql(`update storage.objects set created_at = now() - interval '25 hours' where name like '${prefixe}/%'`)
    const refuses: string[] = []
    for (let i = 0; i < 51; i += 10) {
      refuses.push(...(await Promise.all(Array.from({ length: Math.min(10, 51 - i) }, () => compte('refuse', { etat_le: jours(31) })))).map((u) => u.id))
    }
    const un = await lancer()
    expect(un.debit).toEqual({ supprimes: 10_000 })
    expect(un.envois).toEqual({ supprimes: 500 })
    expect(un.refuses).toEqual({ supprimes: 50, echecs: 0 })
    const deux = await lancer()
    expect(deux.debit).toEqual({ supprimes: 1 })
    expect(deux.envois).toEqual({ supprimes: 1 })
    expect(deux.refuses).toEqual({ supprimes: 1, echecs: 0 })
    expect((await Promise.all(refuses.map(existe))).filter(Boolean)).toHaveLength(0)
    const trois = await lancer()
    expect(trois).toEqual({
      debit: { supprimes: 0 }, envois: { supprimes: 0 }, archives: { campagnes: 0, objets: 0 }, refuses: { supprimes: 0, echecs: 0 },
      attente: { demandes: 0, echecs_envoi: 0, sans_adresse: 0, supprimes: 0, echecs_suppression: 0 }, non_verifies: { supprimes: 0, echecs: 0 }, inactivite: { avertis: 0, echecs_envoi: 0, supprimes: 0, echecs_suppression: 0 },
      jury: { code: 0 }, // jury non configuré dans ce serveur de test
    })
  }, 240_000)

  it('SMTP en panne : personne n\'est marqué prévenu, les suppressions se font quand même', async () => {
    const enPanne = await demarrer(3423, { NUXT_SMTP_HOST: '127.0.0.1', NUXT_SMTP_PORT: '1', CRON_SECRET: SECRET })
    try {
      const attente = await compte('liste_attente', { etat_le: mois(13), email_verifie_le: jours(900) })
      const inactif = await compte('autorise', { derniere_connexion_le: mois(25), email_verifie_le: jours(900) })
      const refuse = await compte('refuse', { etat_le: jours(31) })
      const b = await lancer(enPanne.url)
      expect(b.attente).toMatchObject({ demandes: 0 })
      expect(b.inactivite).toMatchObject({ avertis: 0 })
      expect((await ligne(attente.id)).attente_demandee_le).toBeNull()
      expect(await existe(attente.id)).toBe(true)
      expect((await ligne(inactif.id)).prevenu_inactivite_le).toBeNull()
      expect(await existe(refuse.id)).toBe(false)
      for (const s of sensibles) expect(enPanne.sortie()).not.toContain(s)
    } finally {
      enPanne.arreter()
    }
  })

  it('le journal du serveur ne contient ni pseudo, ni adresse, ni chemin, ni identifiant', () => {
    expect(serveur.sortie()).toContain('Conservation :')
    expect(sensibles.length).toBeGreaterThan(50)
    for (const s of sensibles) expect(serveur.sortie()).not.toContain(s)
  })
})
