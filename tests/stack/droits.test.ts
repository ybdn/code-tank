// Limite de débit, suppression de compte, case de réutilisation et e-mails de résultat, contre la pile locale
// (base, stockage, boîte mail) et le serveur Nuxt construit.
import { createHmac, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anon, API, api, campagne, candidat, demarrer, inscrire, ipNeuve, nettoyer, organisateur, SECRET_DEBIT, statut, utilisateur, zip, type Utilisateur } from './aide'

const MAIL = statut.MAILPIT_URL as string
const SMTP = { NUXT_SMTP_HOST: '127.0.0.1', NUXT_SMTP_PORT: '54425' }
let serveur: Awaited<ReturnType<typeof demarrer>>
const appeler = (m: string, c: string, u?: Utilisateur, corps?: unknown, ip?: string) => api(serveur.url, m, c, u, corps, ip)
const stockage = () => admin.storage.from('depots')
const maintenant = () => new Date().toISOString()
const empreinte = (ip: string) => createHmac('sha256', SECRET_DEBIT).update(ip).digest('hex')
const ipsUtilisees: string[] = []
const ip = () => {
  const i = ipNeuve()
  ipsUtilisees.push(i)
  return i
}

beforeAll(async () => {
  serveur = await demarrer(3415, { ...SMTP, NUXT_VERSION_CHARTE: '2026-12-01', NUXT_SECRET_VERIFICATION: 'secret-de-test-' + randomBytes(16).toString('hex') })
})
afterAll(async () => {
  serveur?.arreter()
  await nettoyer()
})

const declaration = () => ({
  presentation: 'Un minuteur.', demande: '', type_code: 'open_source', declaration_code: true, aucun_outil: true, outils_ia: [], contact_reutilisation: false,
})
const formulaire = () => ({
  vrai_nom: 'Ada Lovelace', pseudo: 'ada' + randomBytes(4).toString('hex'), email_contact: `contact-${randomBytes(5).toString('hex')}@example.org`,
  motivation: 'Je code.', depot_cite_url: 'https://github.com/ada/moteur', charte: true, majeur: true,
})

describe('limite de débit', () => {
  // Chaque plafond atteint : 429 avec Retry-After ; la même requête d'une autre adresse passe.
  it('création de compte : 5 par adresse sur 24 heures', async () => {
    const u = await utilisateur()
    const corps = formulaire()
    const a = ip()
    expect((await appeler('POST', '/api/compte', u, corps, a)).statut).toBe(200)
    for (let i = 0; i < 4; i++) expect((await appeler('POST', '/api/compte', u, corps, a)).statut).toBe(409) // compte déjà créé : la limite compte quand même
    const refus = await appeler('POST', '/api/compte', u, corps, a)
    expect(refus.statut).toBe(429)
    expect(Number(refus.retryAfter)).toBeGreaterThan(0)
    expect(refus.json.statusMessage).toContain('Trop de demandes')
    expect((await appeler('POST', '/api/compte', u, corps, ip())).statut).toBe(409) // autre adresse : la limite ne bloque pas
  })

  it('renvoi du lien de vérification : 5 par heure', async () => {
    const u = await candidat('email_a_verifier')
    const a = ip()
    for (let i = 0; i < 5; i++) expect((await appeler('POST', '/api/compte/verification', u, undefined, a)).statut).toBe(200)
    const refus = await appeler('POST', '/api/compte/verification', u, undefined, a)
    expect(refus.statut).toBe(429)
    expect(Number(refus.retryAfter)).toBeGreaterThan(0)
    expect(Number(refus.retryAfter)).toBeLessThanOrEqual(3600)
    expect((await appeler('POST', '/api/compte/verification', u, undefined, ip())).statut).toBe(200)
  })

  it('confirmation d\'e-mail : 30 par heure ; deux requêtes simultanées au dernier créneau n\'en laissent passer qu\'une', async () => {
    const a = ip()
    for (let i = 0; i < 29; i++) expect((await appeler('POST', '/api/compte/verifier', undefined, { jeton: 'x' }, a)).statut).toBe(200)
    const deux = await Promise.all([1, 2].map(() => appeler('POST', '/api/compte/verifier', undefined, { jeton: 'x' }, a)))
    expect(deux.map((r) => r.statut).sort()).toEqual([200, 429])
    expect(deux.find((r) => r.statut === 429)!.retryAfter).not.toBeNull()
    expect((await appeler('POST', '/api/compte/verifier', undefined, { jeton: 'x' }, ip())).statut).toBe(200)
  })

  it('demande d\'URL de dépôt : 30 par adresse sur 24 heures', async () => {
    const c = await campagne('depot')
    const u = await candidat()
    await inscrire(c, u)
    const a = ip()
    for (let i = 0; i < 30; i++) expect((await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, u, declaration(), a)).statut).toBe(200)
    const refus = await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, u, declaration(), a)
    expect(refus.statut).toBe(429)
    expect(Number(refus.retryAfter)).toBeGreaterThan(0)
    expect((await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, u, declaration(), ip())).statut).toBe(200)
  })

  it('inscription à une campagne : 20 par adresse sur 24 heures, par la route serveur', async () => {
    const c = await campagne('inscriptions')
    const u = await candidat()
    const a = ip()
    expect((await appeler('POST', `/api/campagnes/${c.slug}/inscription`, undefined, undefined, a)).statut).toBe(401)
    expect((await appeler('POST', '/api/campagnes/inconnue/inscription', u, undefined, a)).statut).toBe(404)
    expect((await appeler('POST', `/api/campagnes/${c.slug}/inscription`, u, undefined, a)).statut).toBe(200)
    for (let i = 0; i < 19; i++) {
      const r = await appeler('POST', `/api/campagnes/${c.slug}/inscription`, u, undefined, a)
      expect(r.statut).toBe(409)
      expect(r.json.statusMessage).toContain('déjà inscrit')
    }
    expect((await appeler('POST', `/api/campagnes/${c.slug}/inscription`, u, undefined, a)).statut).toBe(429)
    expect((await appeler('POST', `/api/campagnes/${c.slug}/inscription`, u, undefined, ip())).statut).toBe(409)
    const nonAutorise = await candidat('verifie')
    expect((await appeler('POST', `/api/campagnes/${c.slug}/inscription`, nonAutorise, undefined, ip())).json.statusMessage).toContain('pas autorisé')
  })

  it('suppression de compte : 5 par adresse sur 24 heures', async () => {
    const a = ip()
    const comptes = await Promise.all(Array.from({ length: 6 }, () => candidat()))
    const pseudo = async (u: Utilisateur) => (await admin.from('compte').select('pseudo').eq('id', u.id).single()).data!.pseudo
    for (const u of comptes.slice(0, 5)) expect((await appeler('DELETE', '/api/compte', u, { pseudo: await pseudo(u) }, a)).statut).toBe(200)
    const sixieme = comptes[5]!
    const refus = await appeler('DELETE', '/api/compte', sixieme, { pseudo: await pseudo(sixieme) }, a)
    expect(refus.statut).toBe(429)
    expect(Number(refus.retryAfter)).toBeGreaterThan(0)
    expect((await admin.from('compte').select('id').eq('id', sixieme.id)).data).toHaveLength(1)
    expect((await appeler('DELETE', '/api/compte', sixieme, { pseudo: await pseudo(sixieme) }, ip())).statut).toBe(200)
  })

  it('la table ne contient aucune adresse IP en clair, seulement leur empreinte à clé secrète', async () => {
    const { data } = await admin.from('debit').select('*')
    const texte = JSON.stringify(data)
    for (const i of ipsUtilisees) expect(texte).not.toContain(i)
    expect(ipsUtilisees.length).toBeGreaterThan(5)
    const empreintes = new Set(data!.map((l) => l.empreinte))
    for (const i of ipsUtilisees) expect(empreintes.has(empreinte(i)), i).toBe(true)
    expect(data!.every((l) => /^[0-9a-f]{64}$/.test(l.empreinte))).toBe(true)
  })

  it('deux appels simultanés de la fonction au dernier créneau n\'en laissent passer qu\'un (base)', async () => {
    const e = empreinte(ip())
    const appels = await Promise.all(Array.from({ length: 10 }, () => admin.rpc('consommer_debit', { p_empreinte: e, p_action: 'test', p_maximum: 3, p_fenetre_s: 60 })))
    expect(appels.every((r) => r.error === null)).toBe(true)
    expect(appels.filter((r) => r.data === 0)).toHaveLength(3)
  })

  it('un candidat ne lit ni n\'écrit la table debit, et n\'appelle pas la fonction', async () => {
    const u = await candidat()
    expect((await u.client.from('debit').select('*')).error?.code).toBe('42501')
    expect((await u.client.from('debit').insert({ empreinte: 'a'.repeat(64), action: 'x' })).error?.code).toBe('42501')
    expect((await u.client.from('debit').delete().eq('action', 'x')).error?.code).toBe('42501')
    expect((await u.client.rpc('consommer_debit', { p_empreinte: 'a'.repeat(64), p_action: 'x', p_maximum: 5, p_fenetre_s: 60 })).error?.code).toBe('42501')
    const a = await anon().from('debit').select('*')
    expect(a.error?.code).toBe('42501')
  })

  it('sans secret, ou si la base de la limite est injoignable, la création de compte et le dépôt répondent 503', async () => {
    const sansSecret = await demarrer(3416, { NUXT_SECRET_DEBIT: '', ...SMTP, NUXT_VERSION_CHARTE: '2026-12-01' })
    const panne = await demarrer(3417, { NUXT_SUPABASE_SECRET_KEY: 'cle-fausse', ...SMTP, NUXT_VERSION_CHARTE: '2026-12-01' })
    try {
      expect((await api(sansSecret.url, 'POST', '/api/compte/verifier', undefined, { jeton: 'x' })).statut).toBe(503)
      expect(sansSecret.sortie()).toContain('NUXT_SECRET_DEBIT')
      const u = await utilisateur()
      const r = await api(panne.url, 'POST', '/api/compte', u, formulaire())
      expect(r.statut).toBe(503)
      expect((await admin.from('compte').select('id').eq('id', u.id)).data).toEqual([])
      const c = await campagne('depot')
      const d = await candidat()
      await inscrire(c, d)
      expect((await api(panne.url, 'POST', `/api/campagnes/${c.slug}/depot/url`, d, declaration())).statut).toBe(503)
    } finally {
      sansSecret.arreter()
      panne.arreter()
    }
  })
})

// --- Suppression de compte ----------------------------------------------------------------------------------------------

const tables = ['compte', 'participation', 'depot', 'audit', 'vote_boss', 'decision', 'reception', 'campagne'] as const
const uploader = async (c: { id: string }, pid: string) => {
  const chemin = `${c.id}/${pid}/${crypto.randomUUID()}.zip`
  const { error } = await stockage().upload(chemin, zip(), { contentType: 'application/zip' })
  expect(error).toBeNull()
  return chemin
}
// Dépôt accepté (simulé) avec tout ce qu'un candidat laisse : texte, fichiers, alertes, audit pitch noté 8, réplique et justification.
async function deposerPourDeBon(c: { id: string }, pid: string, m: string) {
  const chemin = await uploader(c, pid)
  const { data: depot, error } = await admin.from('depot').insert({
    participation_id: pid, chemin_stockage: chemin, sha256: 'ab'.repeat(32), taille_octets: 22, nb_fichiers: 3, fichiers_exclus: [`exclu-${m}.js`], nb_tokens: 100,
    presentation: `Presentation-${m}`, demande: `Demande-${m}`, type_code: 'open_source', licence_presente: true, declaration_code_le: maintenant(),
    outils_ia: [`Outil-${m}`], traces_ia: [`Trace-${m}`], contact_reutilisation: true, alerte_manipulation: true, alertes_integrite: [`Alerte-${m}`],
    note_outillage: 5, faits: { secret: `Fait-${m}` },
  }).select('id').single()
  expect(error).toBeNull()
  const audit = await admin.from('audit').insert({
    depot_id: depot!.id, jure: 'pitch', modele: 'm', version_consignes: 'v', statut: 'termine',
    resultat: { criteres: [{ cle: 'brief', note: 8, justification: `Justification-${m}`, preuves: [{ fichier: `fichier-${m}.ts`, ligne: 3 }] }], replique: `Replique-${m}`, verdict: 'convaincu' },
  })
  expect(audit.error).toBeNull()
  return chemin
}
const faire = async (r: PromiseLike<{ error: { message: string } | null }>) => expect((await r).error).toBeNull()

describe('suppression du compte par le candidat', () => {
  it('refuse un mauvais pseudo, l\'organisateur et l\'anonyme ; avec le bon pseudo efface tout sauf la ligne anonyme du classement', async () => {
    const c1 = await campagne('depot') // sera publiée
    const c2 = await campagne('depot') // reste en phase de dépôt
    const A = await candidat()
    const B = await candidat()
    const m = randomBytes(6).toString('hex')
    const marqueurs = { vrai_nom: `Nom-${m}`, motivation: `Motivation-${m}`, depot_cite_url: `https://example.org/${m}` }
    await faire(admin.from('compte').update({ ...marqueurs, github_donnees: { login: `login-${m}` } }).eq('id', A.id))
    const pseudoA = (await admin.from('compte').select('pseudo').eq('id', A.id).single()).data!.pseudo
    const pseudoB = (await admin.from('compte').select('pseudo').eq('id', B.id).single()).data!.pseudo

    const pA1 = await inscrire(c1, A)
    const pB1 = await inscrire(c1, B)
    const pA2 = await inscrire(c2, A)
    const cheminA1 = await deposerPourDeBon(c1, pA1, m)
    await deposerPourDeBon(c1, pB1, 'autre')
    // Une réception encore présente, et deux archives de A en phase de dépôt, dont un envoi jamais confirmé.
    const cheminRec1 = await uploader(c1, pA1)
    await faire(admin.from('reception').insert({ participation_id: pA1, chemin_stockage: cheminRec1, presentation: `Reception-${m}`, type_code: 'open_source', declaration_code_le: maintenant() }))
    const cheminRec2 = await uploader(c2, pA2)
    const orphelin = await uploader(c2, pA2)
    await faire(admin.from('reception').insert({ participation_id: pA2, chemin_stockage: cheminRec2, presentation: `Reception2-${m}`, type_code: 'open_source', declaration_code_le: maintenant() }))
    await faire(admin.from('vote_boss').insert([
      { participation_id: pA1, note: 6, commentaire: `Commentaire-${m}`, verrouille_le: maintenant() },
      { participation_id: pB1, note: 9, commentaire: 'Commentaire de B', verrouille_le: maintenant() },
    ]))
    await faire(admin.from('decision').insert([
      { campagne_id: c1.id, participation_id: pA1, type: 'fermeture_compte', justification: `Motif-prive-${m}` },
      { campagne_id: c1.id, participation_id: pA1, type: 'departage', justification: 'Départage public' },
    ]))
    for (const s of ['deliberation', 'prete', 'publiee']) await faire(admin.from('campagne').update({ statut: s as 'prete' }).eq('id', c1.id))
    // Le départage fait fermeture_compte ne ferme rien ici : on l'a inséré à la main, le compte reste « autorisé ».

    const avant = (await anon().from('classement').select('*').eq('campagne_id', c1.id)).data!
    expect(avant.map((l) => l.pseudo).sort()).toEqual([pseudoA, pseudoB].sort())

    // Refus.
    const mauvais = await appeler('DELETE', '/api/compte', A, { pseudo: pseudoA.toUpperCase() })
    expect(mauvais.statut).toBe(422)
    expect(mauvais.json.data.erreurs.pseudo).toBeTruthy()
    expect((await appeler('DELETE', '/api/compte', A, {})).statut).toBe(422)
    expect((await appeler('DELETE', '/api/compte', undefined, { pseudo: pseudoA })).statut).toBe(401)
    const orga = await organisateur()
    const pseudoOrga = (await admin.from('compte').select('pseudo').eq('id', orga.id).single()).data!.pseudo
    expect((await appeler('DELETE', '/api/compte', orga, { pseudo: pseudoOrga })).statut).toBe(403)
    expect((await admin.from('compte').select('id').eq('id', orga.id)).data).toHaveLength(1)
    expect((await admin.auth.admin.getUserById(A.id)).data.user).not.toBeNull()
    expect((await admin.from('compte').select('id').eq('id', A.id)).data).toHaveLength(1)

    // Suppression.
    expect((await appeler('DELETE', '/api/compte', A, { pseudo: pseudoA })).statut).toBe(200)

    // Auth : l'utilisateur n'existe plus, la session ne vaut plus rien.
    expect((await admin.auth.admin.getUserById(A.id)).data.user).toBeNull()
    expect((await appeler('DELETE', '/api/compte', A, { pseudo: pseudoA })).statut).toBe(401)
    expect((await admin.from('compte').select('id').eq('id', A.id)).data).toEqual([])

    // Stockage : plus aucune archive de A, dans aucune des deux campagnes ; celle de B est intacte.
    for (const [c, p] of [[c1, pA1], [c2, pA2]] as const) expect((await stockage().list(`${c.id}/${p}`)).data).toEqual([])
    expect((await stockage().exists(cheminA1)).data).toBe(false)
    expect((await stockage().exists(orphelin)).data).toBe(false)
    expect((await stockage().list(`${c1.id}/${pB1}`)).data).toHaveLength(1)

    // Base : la participation de la campagne publiée reste, anonyme ; celle de la campagne en phase de dépôt disparaît avec ses données.
    expect((await admin.from('participation').select('compte_id, etat').eq('id', pA1).single()).data).toEqual({ compte_id: null, etat: 'inscrit' })
    expect((await admin.from('participation').select('id').eq('id', pA2)).data).toEqual([])
    expect((await admin.from('reception').select('id').in('participation_id', [pA1, pA2])).data).toEqual([])
    const depot = (await admin.from('depot').select('*').eq('participation_id', pA1).single()).data!
    expect(depot).toMatchObject({
      chemin_stockage: null, sha256: '0'.repeat(64), presentation: '[effacé]', demande: null, fichiers_exclus: [], outils_ia: [], traces_ia: [],
      faits: null, alerte_manipulation: false, alertes_integrite: [], contact_reutilisation: false, note_outillage: 5,
    })
    const audit = (await admin.from('audit').select('resultat').eq('depot_id', depot.id).single()).data!
    expect(audit.resultat).toEqual({ criteres: [{ cle: 'brief', note: 8 }] })
    expect((await admin.from('vote_boss').select('note, commentaire, verrouille_le').eq('participation_id', pA1).single()).data)
      .toMatchObject({ note: 6, commentaire: null, verrouille_le: expect.any(String) })
    expect((await admin.from('decision').select('type, justification').eq('participation_id', pA1)).data).toEqual([{ type: 'departage', justification: 'Départage public' }])

    // Aucune donnée personnelle ne survit, où que ce soit dans la base.
    const tout = JSON.stringify(await Promise.all(tables.map(async (t) => (await admin.from(t).select('*')).data)))
    for (const donnee of [m, A.email, A.githubId, pseudoA]) expect(tout, donnee).not.toContain(donnee)

    // Classement : la ligne reste sous « candidat supprimé » avec ses scores ; celle de B ne bouge pas.
    const apres = (await anon().from('classement').select('*').eq('campagne_id', c1.id)).data!
    const anonyme = apres.find((l) => l.pseudo === 'candidat supprimé')!
    expect(anonyme).toMatchObject({ score_claude: 80, note_boss: 6, notes: { brief: 8 }, justification_departage: 'Départage public' })
    expect(anonyme.score_final).toBeCloseTo((2 * 80 + 10 * 6) / 3)
    expect(apres.find((l) => l.pseudo === pseudoB)).toMatchObject({ score_claude: 80, note_boss: 9 })
    expect((await admin.from('compte').select('vrai_nom, motivation').eq('id', B.id).single()).data).toEqual({ vrai_nom: 'Ada Lovelace', motivation: 'Je code.' })
    expect((await admin.auth.admin.getUserById(B.id)).data.user).not.toBeNull()
    expect((await admin.from('depot').select('presentation').eq('participation_id', pB1).single()).data?.presentation).toBe('Presentation-autre')
    expect((await admin.from('vote_boss').select('commentaire').eq('participation_id', pB1).single()).data?.commentaire).toBe('Commentaire de B')
  })

  it('si le stockage échoue, le compte et la base ne sont pas touchés', async () => {
    const c = await campagne('depot')
    const u = await candidat()
    const pseudo = (await admin.from('compte').select('pseudo').eq('id', u.id).single()).data!.pseudo
    const pid = await inscrire(c, u)
    const chemin = await uploader(c, pid)
    await faire(admin.from('reception').insert({ participation_id: pid, chemin_stockage: chemin, presentation: 'x', type_code: 'open_source', declaration_code_le: maintenant() }))
    // Le serveur parle à la pile par un relais qui répond 500 à tout ce qui touche au stockage.
    const relais = createServer(async (req, res) => {
      if (req.url?.startsWith('/storage/')) return void res.writeHead(500, { 'content-type': 'application/json' }).end('{"message":"panne"}')
      const corps = await new Promise<Buffer>((ok) => { const m: Buffer[] = []; req.on('data', (d) => m.push(d)).on('end', () => ok(Buffer.concat(m))) })
      const { host: _h, connection: _c, 'content-length': _l, ...entetes } = req.headers as Record<string, string>
      const r = await fetch(API + req.url, { method: req.method, headers: entetes, body: corps.length ? corps : undefined, redirect: 'manual' })
      const { 'content-encoding': _e, 'content-length': _n, 'transfer-encoding': _t, ...sortie } = Object.fromEntries(r.headers)
      res.writeHead(r.status, sortie).end(Buffer.from(await r.arrayBuffer()))
    })
    await new Promise<void>((ok) => relais.listen(0, '127.0.0.1', ok))
    const enPanne = await demarrer(3419, { NUXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${(relais.address() as AddressInfo).port}`, ...SMTP })
    try {
      const r = await api(enPanne.url, 'DELETE', '/api/compte', u, { pseudo })
      expect(r.statut).toBe(500)
      expect(r.json.statusMessage).toContain('archive')
    } finally {
      enPanne.arreter()
      relais.close()
    }
    expect((await admin.auth.admin.getUserById(u.id)).data.user).not.toBeNull()
    expect((await admin.from('compte').select('id').eq('id', u.id)).data).toHaveLength(1)
    expect((await admin.from('participation').select('compte_id').eq('id', pid).single()).data?.compte_id).toBe(u.id)
    expect((await admin.from('reception').select('id').eq('participation_id', pid)).data).toHaveLength(1)
    expect((await stockage().exists(chemin)).data).toBe(true)
  })
})

// --- Case de réutilisation ----------------------------------------------------------------------------------------------

describe('case de réutilisation', () => {
  it('son propriétaire la modifie avant et après la clôture ; un autre non ; l\'anonyme non', async () => {
    const c = await campagne('depot')
    const [a, b] = [await candidat(), await candidat()]
    const pa = await inscrire(c, a)
    await inscrire(c, b)
    await faire(admin.from('reception').insert({ participation_id: pa, chemin_stockage: `${c.id}/${pa}/x.zip`, presentation: 'x', type_code: 'open_source', declaration_code_le: maintenant() }))
    const regler = (u: { client: ReturnType<typeof anon> }, accord: boolean) => u.client.rpc('regler_contact_reutilisation', { p_campagne_id: c.id, p_accord: accord })
    const valeur = async () => (await admin.from('reception').select('contact_reutilisation').eq('participation_id', pa).single()).data?.contact_reutilisation

    expect((await regler(a, true)).error).toBeNull()
    expect(await valeur()).toBe(true)
    expect((await a.client.from('ma_reception').select('contact_reutilisation').single()).data?.contact_reutilisation).toBe(true)
    // L'autre candidat, inscrit mais sans dépôt ni envoi, ne touche pas à celle d'Alice.
    expect((await regler(b, false)).error?.message).toContain('ni dépôt ni envoi')
    expect(await valeur()).toBe(true)
    expect((await regler({ client: anon() }, false)).error).not.toBeNull()

    // Après la clôture, dépôt accepté : la case des deux lignes suit.
    await faire(admin.from('depot').insert({
      participation_id: pa, sha256: 'a'.repeat(64), taille_octets: 22, nb_fichiers: 1, nb_tokens: 1, presentation: 'x', type_code: 'open_source',
      licence_presente: true, declaration_code_le: maintenant(), contact_reutilisation: true,
    }))
    for (const s of ['deliberation', 'prete']) await faire(admin.from('campagne').update({ statut: s as 'prete' }).eq('id', c.id))
    expect((await regler(a, false)).error).toBeNull()
    expect(await valeur()).toBe(false)
    expect((await a.client.from('mon_depot').select('contact_reutilisation').single()).data?.contact_reutilisation).toBe(false)
    expect((await admin.from('depot').select('presentation').eq('participation_id', pa).single()).data?.presentation).toBe('x')
  })
})

// --- E-mails de résultat ------------------------------------------------------------------------------------------------

async function recus(adresse: string, attendus: number) {
  for (let i = 0; i < 40; i++) {
    const { messages } = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${adresse}`)}`)).json()
    if (messages.length >= attendus) return Promise.all(messages.map(async (x: { ID: string }) => (await fetch(`${MAIL}/api/v1/message/${x.ID}`)).json()))
    await new Promise((r) => setTimeout(r, 150))
  }
  return []
}

// Campagne prête à publier : verifie (dépôt, adresse vérifiée), nonVerifie (dépôt, adresse non vérifiée), sansDepot (inscrit, vérifié).
async function campagnePrete() {
  const c = await campagne('depot')
  const [verifie, nonVerifie, sansDepot] = [await candidat(), await candidat(), await candidat()]
  for (const u of [verifie, sansDepot]) await faire(admin.from('compte').update({ email_verifie_le: maintenant() }).eq('id', u.id))
  const ids = { verifie: await inscrire(c, verifie), nonVerifie: await inscrire(c, nonVerifie) }
  await inscrire(c, sansDepot)
  for (const [m, p] of Object.entries(ids)) await deposerPourDeBon(c, p, m)
  for (const s of ['deliberation', 'prete']) await faire(admin.from('campagne').update({ statut: s as 'prete' }).eq('id', c.id))
  await faire(admin.from('vote_boss').insert(Object.values(ids).map((participation_id) => ({ participation_id, note: 7, verrouille_le: maintenant() }))))
  return { c, verifie, nonVerifie, sansDepot }
}

describe('e-mails de résultat à la publication', () => {
  it('part aux seuls participants avec dépôt et adresse vérifiée, sans score ; le décompte est donné à l\'organisateur', async () => {
    const orga = await organisateur()
    const { c, verifie, nonVerifie, sansDepot } = await campagnePrete()
    const r = await appeler('POST', `/api/admin/campagnes/${c.slug}/statut`, orga, { statut: 'publiee' })
    expect(r.statut).toBe(200)
    expect(r.json.courriels).toEqual({ envoyes: 1, echecs: 0, sansAdresseVerifiee: 1 })

    const [mail] = await recus(verifie.email, 1)
    expect(mail.From.Address).toBe('code-tank@ybdn.io')
    expect(mail.Text).toContain(`${serveur.url}/campagnes/${c.slug}`)
    expect(mail.Text).toContain('Campagne de test')
    expect(mail.Text).not.toMatch(/score|classement|note|\d+\s*\/\s*\d+|\b(80|73|7)\b/i)
    expect(mail.HTML).toBe('')
    expect(mail.Attachments ?? []).toHaveLength(0)
    expect(mail.Inline ?? []).toHaveLength(0)
    expect(await recus(nonVerifie.email, 1)).toHaveLength(0)
    expect(await recus(sansDepot.email, 1)).toHaveLength(0)
    expect((await admin.from('campagne').select('statut').eq('id', c.id).single()).data?.statut).toBe('publiee')
    // Rien dans le journal du serveur ne cite une adresse.
    for (const u of [verifie, nonVerifie, sansDepot]) expect(serveur.sortie()).not.toContain(u.email)
  })

  it('les autres étapes n\'envoient aucun e-mail', async () => {
    const orga = await organisateur()
    const c = await campagne('inscriptions')
    const u = await candidat()
    await faire(admin.from('compte').update({ email_verifie_le: maintenant() }).eq('id', u.id))
    await inscrire(c, u)
    const r = await appeler('POST', `/api/admin/campagnes/${c.slug}/statut`, orga, { statut: 'depot' })
    expect(r.statut).toBe(200)
    expect(r.json.courriels).toBeUndefined()
    expect(await recus(u.email, 1)).toHaveLength(0)
  })

  it('la publication réussit même si le SMTP est en panne : zéro envoyé, l\'échec est compté, aucune adresse dans le journal', async () => {
    const enPanne = await demarrer(3418, { NUXT_SMTP_HOST: '127.0.0.1', NUXT_SMTP_PORT: '1' })
    try {
      const orga = await organisateur()
      const { c, verifie, nonVerifie } = await campagnePrete()
      const r = await api(enPanne.url, 'POST', `/api/admin/campagnes/${c.slug}/statut`, orga, { statut: 'publiee' })
      expect(r.statut).toBe(200)
      expect(r.json.courriels).toEqual({ envoyes: 0, echecs: 1, sansAdresseVerifiee: 1 })
      expect((await admin.from('campagne').select('statut').eq('id', c.id).single()).data?.statut).toBe('publiee')
      expect(await recus(verifie.email, 1)).toHaveLength(0)
      for (const u of [verifie, nonVerifie]) expect(enPanne.sortie()).not.toContain(u.email)
    } finally {
      enPanne.arreter()
    }
  })
})
