// Administration contre la pile Supabase locale et le serveur Nuxt construit : accès réservé, comptes, réglages, campagnes,
// dépôts, vote à l'aveugle, décisions et publication. Les écritures de l'organisateur passent par sa session.
import { randomBytes } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { creerJeton } from '../../server/utils/jeton'
import { admin, anon, api, candidat, campagne as campagneService, demarrer, nettoyer, organisateur, utilisateur, zip, type Utilisateur } from './aide'

const SECRET = 'secret-de-test-' + randomBytes(16).toString('hex')
const UUID = '00000000-0000-4000-8000-000000000000'
let serveur: { url: string; arreter: () => void; sortie: () => string }
let orga: Utilisateur
let reglageInitial: { plafond_comptes: number | null; plafond_depense_usd: number }
const appeler = (m: string, c: string, u?: Utilisateur, corps?: unknown) => api(serveur.url, m, c, u, corps)
const page = async (c: string, u?: Utilisateur) => {
  const r = await fetch(serveur.url + c, { redirect: 'manual', headers: u ? { cookie: u.cookie } : {} })
  return { statut: r.status, texte: await r.text(), entetes: r.headers }
}
const maintenant = () => new Date().toISOString()
const jours = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

beforeAll(async () => {
  serveur = await demarrer(3414, { NUXT_SECRET_VERIFICATION: SECRET, NUXT_VERSION_CHARTE: '2026-12-01' })
  orga = await organisateur()
  reglageInitial = (await admin.from('reglage').select('plafond_comptes, plafond_depense_usd').single()).data!
})
afterAll(async () => {
  serveur?.arreter()
  await admin.from('reglage').update(reglageInitial).not('plafond_depense_usd', 'is', null)
  await nettoyer()
})

// Routes d'administration : chaque fichier de server/api/admin, avec sa méthode.
const racineApi = fileURLToPath(new URL('../../server/api/admin', import.meta.url))
const fichiers = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? fichiers(join(d, f)) : [join(d, f)]))
const routes = fichiers(racineApi).map((f) => {
  const [, chemin, methode] = /^(.*?)(?:\/index)?\.(get|post|put|patch|delete)\.ts$/.exec(relative(racineApi, f))!
  return [methode!.toUpperCase(), '/api/admin/' + chemin!.replace(/\[slug\]/g, 'x').replace(/\[id\]/g, UUID)] as const
})
const PAGES = ['/admin', '/admin/comptes', '/admin/reglages', '/admin/campagnes', '/admin/campagnes/une-campagne']

describe('accès réservé à l\'organisateur', () => {
  it('trouve bien les routes d\'administration à contrôler', () => {
    expect(routes.length).toBeGreaterThanOrEqual(14)
  })

  it('répond 404 sans session, pour une page comme pour chaque route d\'API, sans redirection', async () => {
    for (const c of [...PAGES, '/Admin', '/ADMIN/comptes', '/%61dmin', '//admin/comptes']) {
      const r = await page(c)
      expect(r.statut, c).toBe(404)
      expect(r.entetes.get('location'), c).toBeNull()
      expect(r.texte, c).not.toContain('Tableau de bord')
    }
    for (const [m, c] of routes) {
      const r = await appeler(m, c, undefined, m === 'GET' ? undefined : {})
      expect(r.statut, `${m} ${c}`).toBe(404)
    }
  })

  it('répond 404 à un candidat autorisé (et à un compte sans ligne de compte), jamais 403', async () => {
    const c = await candidat('autorise')
    const sansCompte = await utilisateur()
    for (const u of [c, sansCompte]) {
      for (const p of PAGES) expect((await page(p, u)).statut, p).toBe(404)
      for (const [m, chemin] of routes) {
        const r = await appeler(m, chemin, u, m === 'GET' ? undefined : {})
        expect(r.statut, `${m} ${chemin}`).toBe(404)
      }
    }
  })

  it('montre les pages à l\'organisateur, avec une indication de non-indexation, sans lien public vers l\'administration', async () => {
    for (const p of PAGES.slice(0, 4)) {
      const r = await page(p, orga)
      expect(r.statut, p).toBe(200)
      expect(r.texte, p).toContain('noindex')
      expect(r.entetes.get('x-robots-tag'), p).toContain('noindex')
    }
    expect((await page('/admin/campagnes/une-campagne', orga)).statut).toBe(404) // campagne inconnue
    for (const p of ['/', '/charte', '/compte']) expect((await page(p, orga)).texte, p).not.toMatch(/href="\/admin/)
  })
})

describe('comptes', () => {
  it('liste les candidats avec ce qui aide à décider, rendu comme du texte', async () => {
    const v = await candidat('verifie')
    await admin.from('compte').update({
      motivation: '<img src=x onerror=alert(1)> Je code.', depot_cite_url: 'https://example.org/projet',
      github_donnees: { login: 'ada', compte_cree_le: '2015-03-01T10:00:00Z', depots_publics: 12, derniere_activite: '2026-11-20T08:00:00Z', evenements_recents: 2, lu_le: '2026-11-22T08:00:00Z' },
    }).eq('id', v.id)
    const r = await appeler('GET', '/api/admin/comptes', orga)
    expect(r.statut).toBe(200)
    const liste = (r.json as unknown as { comptes: { id: string; vrai_nom: string; etat: string }[] }).comptes
    expect(liste.find((c) => c.id === v.id)).toMatchObject({ vrai_nom: 'Ada Lovelace', etat: 'verifie' })

    const html = (await page('/admin/comptes', orga)).texte
    expect(html).toContain('Vérifiés, en attente d&#39;autorisation')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('12 dépôts publics')
  })

  it('autorise, refuse, met en liste d\'attente ; les transitions interdites sont refusées avec le message de la base', async () => {
    const [a, b, c] = [await candidat('verifie'), await candidat('verifie'), await candidat('verifie')]
    const decider = (u: Utilisateur, etat: unknown) => appeler('POST', `/api/admin/comptes/${u.id}/decision`, orga, { etat })
    const etat = async (u: Utilisateur) => (await admin.from('compte').select('etat').eq('id', u.id).single()).data?.etat

    expect((await decider(a, 'autorise')).statut).toBe(200)
    expect(await etat(a)).toBe('autorise')
    expect((await decider(b, 'refuse')).statut).toBe(200)
    expect(await etat(b)).toBe('refuse')
    expect((await decider(c, 'liste_attente')).statut).toBe(200)
    expect(await etat(c)).toBe('liste_attente')
    expect((await decider(c, 'autorise')).statut).toBe(200)

    const refus = await decider(a, 'refuse')
    expect(refus.statut).toBe(409)
    expect(refus.json.statusMessage).toContain('ni vérifié ni en liste d\'attente')
    expect(await etat(a)).toBe('autorise')
    expect((await decider(a, 'ferme')).statut).toBe(422)
    expect((await decider(a, undefined)).statut).toBe(422)
    expect((await appeler('POST', '/api/admin/comptes/pas-un-uuid/decision', orga, { etat: 'autorise' })).statut).toBe(404)
    const absent = await decider({ id: UUID } as Utilisateur, 'autorise')
    expect(absent.statut).toBe(409)
  })

  it('ne décide pas un compte dont l\'e-mail n\'est pas vérifié, ni un organisateur', async () => {
    const e = await candidat('email_a_verifier')
    expect((await appeler('POST', `/api/admin/comptes/${e.id}/decision`, orga, { etat: 'autorise' })).statut).toBe(409)
    expect((await appeler('POST', `/api/admin/comptes/${orga.id}/decision`, orga, { etat: 'refuse' })).statut).toBe(409)
  })
})

describe('réglages et plafond de comptes', () => {
  it('lit et modifie les deux plafonds, refuse les valeurs invalides champ par champ', async () => {
    const ok = await appeler('PATCH', '/api/admin/reglages', orga, { plafond_comptes: 500, plafond_depense_usd: 75.5 })
    expect(ok.statut).toBe(200)
    expect((await appeler('GET', '/api/admin/reglages', orga)).json).toMatchObject({ plafond_comptes: 500, plafond_depense_usd: 75.5 })
    expect((await appeler('PATCH', '/api/admin/reglages', orga, { plafond_comptes: null, plafond_depense_usd: 50 })).statut).toBe(200)
    expect((await admin.from('reglage').select('plafond_comptes').single()).data?.plafond_comptes).toBeNull()

    for (const corps of [{ plafond_comptes: -1, plafond_depense_usd: 50 }, { plafond_comptes: 1.5, plafond_depense_usd: 50 }, { plafond_comptes: 10, plafond_depense_usd: 0 }, { plafond_comptes: 10 }]) {
      const r = await appeler('PATCH', '/api/admin/reglages', orga, corps)
      expect(r.statut, JSON.stringify(corps)).toBe(422)
      expect(Object.keys(r.json.data.erreurs).length).toBeGreaterThan(0)
    }
    expect((await page('/admin/reglages', orga)).texte).toContain('Plafond de dépense')
  })

  it('le plafond s\'applique : au-delà, un compte vérifié passe en liste d\'attente, et l\'organisateur le fait monter', async () => {
    const pris = (await admin.from('compte').select('id', { count: 'exact', head: true }).eq('role', 'candidat').in('etat', ['verifie', 'autorise'])).count!
    expect((await appeler('PATCH', '/api/admin/reglages', orga, { plafond_comptes: pris, plafond_depense_usd: 50 })).statut).toBe(200)
    const html = (await page('/admin/comptes', orga)).texte
    expect(html).toContain('Plafond de comptes')
    expect(html).toContain('Le plafond est atteint')

    const u = await candidat('email_a_verifier')
    const confirmer = async () => (await appeler('POST', '/api/compte/verifier', undefined, { jeton: creerJeton(u.id, u.email, SECRET) })).json.resultat
    expect(await confirmer()).toBe('ok')
    expect((await admin.from('compte').select('etat').eq('id', u.id).single()).data?.etat).toBe('liste_attente')

    expect((await appeler('POST', `/api/admin/comptes/${u.id}/decision`, orga, { etat: 'autorise' })).statut).toBe(200)
    expect((await admin.from('compte').select('etat').eq('id', u.id).single()).data?.etat).toBe('autorise')

    // Sans plafond, le même parcours donne un compte vérifié.
    expect((await appeler('PATCH', '/api/admin/reglages', orga, { plafond_comptes: null, plafond_depense_usd: 50 })).statut).toBe(200)
    const v = await candidat('email_a_verifier')
    expect((await appeler('POST', '/api/compte/verifier', undefined, { jeton: creerJeton(v.id, v.email, SECRET) })).json.resultat).toBe('ok')
    expect((await admin.from('compte').select('etat').eq('id', v.id).single()).data?.etat).toBe('verifie')
  })
})

// Archive et audits simulés : le contrôle du zip et les audits Claude vivent hors de ce dépôt.
async function deposerSimule(campagneId: string, pid: string, options: { audit?: boolean } = {}) {
  const chemin = `${campagneId}/${pid}/${crypto.randomUUID()}.zip`
  expect((await admin.storage.from('depots').upload(chemin, zip(40))).error).toBeNull()
  const base = { participation_id: pid, chemin_stockage: chemin, presentation: 'Mon <b>minuteur</b>', type_code: 'open_source' as const, declaration_code_le: maintenant() }
  await admin.from('reception').insert({ ...base, etat: 'acceptee', traitee_le: maintenant(), outils_ia: ['Claude Code'] })
  const { data, error } = await admin.from('depot').insert({
    ...base, sha256: 'a'.repeat(64), taille_octets: 40, nb_fichiers: 3, fichiers_exclus: ['node_modules/'], nb_tokens: 1234, licence_presente: true,
    outils_ia: ['Claude Code'], contact_reutilisation: true, alerte_manipulation: true, note_outillage: 6,
    // Formes écrites par le contrôle des zips : « Claude Code » (Anthropic) couvre la trace claude, pas cursor.
    traces_ia: [
      { outil: 'claude', type: 'dossier', fichier: '.claude/settings.json', occurrences: 2, declaree: true },
      { outil: 'cursor', type: 'dossier', fichier: '.cursor/rules', ligne: 4, occurrences: 1, declaree: false },
    ],
    alertes_integrite: [{ type: 'postinstall', fichier: 'package.json', ligne: 12 }],
  }).select('id').single()
  if (error) throw error
  if (options.audit !== false) {
    const { error: e } = await admin.from('audit').insert({
      depot_id: data.id, jure: 'pitch', modele: 'modele-de-test', version_consignes: 'v-test', statut: 'termine', cout_usd: 0.42,
      resultat: {
        criteres: [{ cle: 'brief', note: 7, justification: 'JUSTIFICATION-SECRETE <b>gras</b>', preuves: [{ fichier: 'src/a.ts', ligne: 3, constat: 'constat' }] }],
        replique: 'REPLIQUE-SECRETE', verdict: 'convaincu',
      },
    })
    if (e) throw e
  }
  return { chemin, depotId: data.id as string }
}

describe('campagnes, dépôts, vote du Boss et publication', () => {
  const corps = (slug: string, surcharge: Record<string, unknown> = {}) => ({
    slug, titre: 'Défi du minuteur', theme: 'Un minuteur de pause', brief: 'Écris un minuteur <b>gras</b>.',
    criteres: [
      { cle: 'securite', libelle: 'Sécurité', poids: 15, jure: 'sudo' }, { cle: 'erreurs', libelle: 'Erreurs', poids: 10, jure: 'sudo' },
      { cle: 'structure', libelle: 'Structure', poids: 15, jure: 'refacto' }, { cle: 'lisibilite', libelle: 'Lisibilité', poids: 10, jure: 'refacto' },
      { cle: 'tests', libelle: 'Tests', poids: 15, jure: 'lint' }, { cle: 'outillage', libelle: 'Outillage et doc', poids: 10, jure: 'lint', calcule: true },
      { cle: 'brief', libelle: 'Réponse au brief', poids: 15, jure: 'pitch' }, { cle: 'finition', libelle: 'Finition', poids: 10, jure: 'pitch' },
    ],
    ouverture_inscriptions: jours(-1), cloture_depot: jours(7), date_resultats: jours(14), max_participants: 1,
    ...surcharge,
  })
  const slug = 'admin-' + randomBytes(5).toString('hex')
  const statut = (s: string, sl = slug) => appeler('POST', `/api/admin/campagnes/${sl}/statut`, orga, { statut: s })
  let id: string
  let A: Utilisateur, B: Utilisateur, C: Utilisateur, D: Utilisateur
  let pA: string, pB: string
  let depotA: { chemin: string; depotId: string }

  it('crée un brouillon, invisible du public, et le modifie', async () => {
    const r = await appeler('POST', '/api/admin/campagnes', orga, corps(slug))
    expect(r.statut).toBe(200)
    const { data } = await admin.from('campagne').select('*').eq('slug', slug).single()
    id = data!.id
    expect(data).toMatchObject({ statut: 'brouillon', max_participants: 1 })
    expect((await appeler('GET', `/api/campagnes/${slug}`)).statut).toBe(404) // la RLS cache le brouillon au public
    const liste = (await appeler('GET', '/api/admin/campagnes', orga)).json as unknown as { slug: string }[]
    expect(liste.map((c) => c.slug)).toContain(slug)

    expect((await appeler('POST', '/api/admin/campagnes', orga, corps(slug))).json.data.erreurs.slug).toBe('Ce slug est déjà pris.')
    for (const [surcharge, champ] of [[{ slug: 'Pas Valide' }, 'slug'], [{ titre: '' }, 'titre'], [{ cloture_depot: jours(-5) }, 'cloture_depot'], [{ max_participants: 0 }, 'max_participants'], [{ criteres: [] }, 'criteres']] as const) {
      const e = await appeler('POST', '/api/admin/campagnes', orga, corps('autre-' + randomBytes(3).toString('hex'), surcharge))
      expect(e.statut, champ).toBe(422)
      expect(e.json.data.erreurs).toHaveProperty(champ)
    }

    const m = await appeler('PATCH', `/api/admin/campagnes/${slug}`, orga, corps(slug, { titre: 'Défi modifié' }))
    expect(m.statut).toBe(200)
    expect((await admin.from('campagne').select('titre').eq('id', id).single()).data?.titre).toBe('Défi modifié')
    expect((await appeler('PATCH', '/api/admin/campagnes/inconnue', orga, corps('inconnue'))).statut).toBe(404)

    const html = (await page(`/admin/campagnes/${slug}`, orga)).texte
    expect(html).toContain('Défi modifié')
    expect(html).toContain('Écris un minuteur &lt;b&gt;gras&lt;/b&gt;') // le brief est du texte, jamais du HTML
  })

  it('refuse un statut hors ordre et des poids qui ne font pas 100, puis ouvre les inscriptions', async () => {
    const hors = await statut('depot')
    expect(hors.statut).toBe(409)
    expect(hors.json.statusMessage).toContain('Transition de statut interdite')
    expect((await statut('nimporte')).statut).toBe(422)

    const lourd = corps(slug)
    lourd.criteres[0]!.poids = 20
    expect((await appeler('PATCH', `/api/admin/campagnes/${slug}`, orga, lourd)).statut).toBe(200)
    const poids = await statut('inscriptions')
    expect(poids.statut).toBe(409)
    expect(poids.json.statusMessage).toContain('poids')

    expect((await appeler('PATCH', `/api/admin/campagnes/${slug}`, orga, corps(slug))).statut).toBe(200)
    expect((await statut('inscriptions')).statut).toBe(200)
    expect((await appeler('GET', `/api/campagnes/${slug}`)).statut).toBe(200) // devenue publique
    expect((await appeler('PATCH', `/api/admin/campagnes/${slug}`, orga, corps('nouveau-slug'))).json.data.erreurs.slug).toContain('ne se change plus')
  })

  it('inscrit un candidat, applique le quota, puis ajoute à la main au-delà (deux places au plus)', async () => {
    ;[A, B, C, D] = [await candidat(), await candidat(), await candidat(), await candidat()]
    expect((await A.client.rpc('sinscrire', { p_campagne_id: id })).error).toBeNull()
    expect((await B.client.rpc('sinscrire', { p_campagne_id: id })).error?.message).toContain('plus de place')

    const ajouter = (u: Utilisateur) => appeler('POST', `/api/admin/campagnes/${slug}/participants`, orga, { compte_id: u.id })
    expect((await ajouter(B)).statut).toBe(200)
    expect((await ajouter(C)).statut).toBe(200)
    const trop = await ajouter(D)
    expect(trop.statut).toBe(409)
    expect(trop.json.statusMessage).toContain('plus de place')
    expect((await ajouter(B)).statut).toBe(409) // déjà inscrit
    expect((await appeler('POST', `/api/admin/campagnes/${slug}/participants`, orga, { compte_id: 'x' })).statut).toBe(422)
    const nonAutorise = await candidat('verifie')
    expect((await ajouter(nonAutorise)).statut).toBe(409)

    const { data } = await admin.from('participation').select('id, compte_id').eq('campagne_id', id)
    pA = data!.find((p) => p.compte_id === A.id)!.id
    pB = data!.find((p) => p.compte_id === B.id)!.id
    const detail = (await appeler('GET', `/api/admin/campagnes/${slug}`, orga)).json as unknown as DetailCampagne
    expect(detail.participations.map((p) => p.id).sort()).toEqual(data!.map((p) => p.id).sort())
  })

  it('montre le dépôt, ses alertes et la contradiction avec les outils déclarés ; fige les règles au premier dépôt', async () => {
    expect((await statut('depot')).statut).toBe(200)
    depotA = await deposerSimule(id, pA)
    await deposerSimule(id, pB)
    const detail = (await appeler('GET', `/api/admin/campagnes/${slug}`, orga)).json as unknown as DetailCampagne
    const a = detail.participations.find((p) => p.id === pA)!
    expect(a.reception).toMatchObject({ etat: 'acceptee', outils_ia: ['Claude Code'] })
    expect(a.depot).toMatchObject({ nb_fichiers: 3, nb_tokens: 1234, sha256: 'a'.repeat(64), alerte_manipulation: true, archive: true })
    expect(a.depot).not.toHaveProperty('chemin_stockage')
    expect(a.depot).not.toHaveProperty('contact_reutilisation')

    const html = (await page(`/admin/campagnes/${slug}`, orga)).texte
    expect(html).toContain('Contradiction avec la déclaration')
    expect(html).toContain('Trace non couverte par la déclaration : cursor · dossier : .cursor/rules:4, 1 occurrence.')
    expect(html).not.toContain('Trace non couverte par la déclaration : claude')
    expect(html).toContain('postinstall : package.json:12')
    expect(html).not.toContain('[object Object]')
    expect(html).toContain('Aucun dépôt n&#39;est exécuté, par personne')
    expect(html).toContain('Mon &lt;b&gt;minuteur&lt;/b&gt;')

    const figee = await appeler('PATCH', `/api/admin/campagnes/${slug}`, orga, corps(slug, { brief: 'Un autre brief.' }))
    expect(figee.statut).toBe(409)
    expect(figee.json.statusMessage).toContain('figées')
    expect((await appeler('PATCH', `/api/admin/campagnes/${slug}`, orga, corps(slug, { max_participants: 3 }))).statut).toBe(200)
  })

  it('délivre une URL de lecture de 60 secondes à l\'organisateur seul, et l\'archive se télécharge', async () => {
    const refus = await appeler('GET', `/api/admin/participations/${pA}/archive`, A)
    expect(refus.statut).toBe(404)
    expect((await appeler('GET', `/api/admin/participations/${pA}/archive`)).statut).toBe(404)

    const r = await appeler('GET', `/api/admin/participations/${pA}/archive`, orga)
    expect(r.statut).toBe(200)
    const { url } = r.json as unknown as { url: string }
    const jeton = new URL(url).searchParams.get('token')!
    const charge = JSON.parse(Buffer.from(jeton.split('.')[1]!, 'base64url').toString())
    expect(charge.exp - charge.iat).toBe(60)
    const fichier = await fetch(url)
    expect(fichier.status).toBe(200)
    expect(fichier.headers.get('content-disposition')).toContain('attachment')
    expect((await fichier.arrayBuffer()).byteLength).toBe(40)
    // Sans jeton, l'archive reste privée.
    expect((await fetch(url.split('?')[0]!)).status).not.toBe(200)
    expect((await appeler('GET', `/api/admin/participations/${UUID}/archive`, orga)).statut).toBe(404)
  })

  it('vote à l\'aveugle : audits, rapport et case de réutilisation cachés tant que le vote n\'est pas verrouillé', async () => {
    const vote = (n: unknown, commentaire = 'Bien.') => appeler('PUT', `/api/admin/participations/${pA}/vote`, orga, { note: n, commentaire })
    // Hors délibération, la base refuse d'écrire un vote.
    expect((await vote(7)).statut).toBe(409)
    expect((await statut('deliberation')).statut).toBe(200)

    expect((await vote(11)).json.data.erreurs).toHaveProperty('note')
    expect((await vote(7.5)).statut).toBe(422)
    expect((await vote('7')).statut).toBe(422)
    expect((await vote(7)).statut).toBe(200)
    expect((await vote(8, 'Mieux que prévu.')).statut).toBe(200) // modifiable tant qu'il n'est pas verrouillé
    expect((await admin.from('vote_boss').select('note, commentaire, verrouille_le').eq('participation_id', pA).single()).data)
      .toEqual({ note: 8, commentaire: 'Mieux que prévu.', verrouille_le: null })

    // Session de l'organisateur : rien à lire avant le verrouillage.
    expect((await orga.client.from('audit').select('id').eq('depot_id', depotA.depotId)).data).toEqual([])
    expect((await orga.client.from('contact_reutilisation_lisible').select('*').eq('participation_id', pA)).data).toEqual([])
    const detail = await appeler('GET', `/api/admin/campagnes/${slug}`, orga)
    expect((detail.json as unknown as DetailCampagne).participations.find((p) => p.id === pA)!.apres).toBeNull()
    expect(detail.texte).not.toMatch(/REPLIQUE-SECRETE|JUSTIFICATION-SECRETE/)
    const html = (await page(`/admin/campagnes/${slug}`, orga)).texte
    expect(html).not.toMatch(/REPLIQUE-SECRETE|JUSTIFICATION-SECRETE/)
    expect(html).toContain('Vote à l&#39;aveugle')

    // Aperçu du classement : la ligne existe, mais son score Claude et ses notes restent cachés.
    const apercu = await appeler('GET', `/api/admin/campagnes/${slug}/classement`, orga)
    expect(apercu.statut).toBe(200)
    const lignes = apercu.json as unknown as LigneApercu[]
    expect(lignes.every((l) => !l.vote_verrouille && l.score_claude === null && l.notes === null && l.rang === null)).toBe(true)
    expect(lignes.find((l) => l.participation_id === pA)).toBeDefined()
    expect(apercu.texte).not.toMatch(/REPLIQUE-SECRETE|JUSTIFICATION-SECRETE/)
    expect(html).toContain('Aperçu du classement')
    expect(html).toContain('Vote du Boss non verrouillé : score Claude caché.')
    expect((await appeler('GET', `/api/admin/campagnes/${slug}/classement`, A)).statut).toBe(404)
    expect((await appeler('GET', `/api/campagnes/${slug}/classement`)).json).toEqual([])

    // Un vote sans dépôt, une participation inconnue.
    expect((await appeler('PUT', `/api/admin/participations/${UUID}/vote`, orga, { note: 5 })).statut).toBe(409)
  })

  it('verrouille le vote (définitif), puis les audits, la case de réutilisation et la note d\'outillage deviennent lisibles', async () => {
    expect((await appeler('POST', `/api/admin/participations/${pA}/verrouillage`, orga)).statut).toBe(200)
    const modif = await appeler('PUT', `/api/admin/participations/${pA}/vote`, orga, { note: 2 })
    expect(modif.statut).toBe(409)
    expect(modif.json.statusMessage).toContain('verrouillé')
    expect((await appeler('POST', `/api/admin/participations/${pA}/verrouillage`, orga)).statut).toBe(409)
    expect((await admin.from('vote_boss').select('note').eq('participation_id', pA).single()).data?.note).toBe(8)

    expect((await orga.client.from('audit').select('id').eq('depot_id', depotA.depotId)).data).toHaveLength(1)
    expect((await orga.client.from('contact_reutilisation_lisible').select('contact_reutilisation').eq('participation_id', pA)).data).toEqual([{ contact_reutilisation: true }])
    const a = ((await appeler('GET', `/api/admin/campagnes/${slug}`, orga)).json as unknown as DetailCampagne).participations.find((p) => p.id === pA)!
    expect(a.vote).toMatchObject({ note: 8 })
    expect(a.apres).toMatchObject({ contact_reutilisation: true, note_outillage: 6 })
    expect(a.apres!.audits).toHaveLength(1)
    expect(a.apres!.audits[0]).toMatchObject({ jure: 'pitch', statut: 'termine', replique_masquee: false, cout_usd: 0.42 })

    const html = (await page(`/admin/campagnes/${slug}`, orga)).texte
    expect(html).toContain('REPLIQUE-SECRETE')
    expect(html).toContain('JUSTIFICATION-SECRETE &lt;b&gt;gras&lt;/b&gt;')
    expect(html).toContain('src/a.ts:3')

    // Aperçu : vote verrouillé, notes visibles ; un seul juré a rendu son audit, donc pas encore de score Claude ni de rang.
    const ligne = ((await appeler('GET', `/api/admin/campagnes/${slug}/classement`, orga)).json as unknown as LigneApercu[])
      .find((l) => l.participation_id === pA)
    expect(ligne).toMatchObject({ participation_id: pA, vote_verrouille: true, note_boss: 8, score_claude: null, score_final: null, rang: null })
    expect(ligne!.notes).toMatchObject({ outillage: 6 })
    expect(html).toContain('Audits incomplets')
  })

  it('masque une réplique, enregistre une décision avec sa justification, refuse les doublons et les justifications vides', async () => {
    const { data: audit } = await admin.from('audit').select('id').eq('depot_id', depotA.depotId).single()
    expect((await appeler('POST', `/api/admin/audits/${audit!.id}/masquage`, orga)).statut).toBe(200)
    expect((await admin.from('audit').select('replique_masquee').eq('id', audit!.id).single()).data?.replique_masquee).toBe(true)
    expect((await appeler('POST', `/api/admin/audits/${UUID}/masquage`, orga)).statut).toBe(409)
    expect((await page(`/admin/campagnes/${slug}`, orga)).texte).toContain('Démasquer la réplique')
    expect((await appeler('POST', `/api/admin/audits/${audit!.id}/demasquage`, orga)).statut).toBe(200)
    expect((await admin.from('audit').select('replique_masquee').eq('id', audit!.id).single()).data?.replique_masquee).toBe(false)
    expect((await appeler('POST', `/api/admin/audits/${UUID}/demasquage`, orga)).statut).toBe(409)
    expect((await appeler('POST', `/api/admin/audits/${audit!.id}/masquage`, orga)).statut).toBe(200) // masquée de nouveau

    const decision = (type: unknown, justification: unknown, pid = pA) => appeler('POST', `/api/admin/participations/${pid}/decision`, orga, { type, justification })
    expect((await decision('departage', '  ')).json.data.erreurs).toHaveProperty('justification')
    expect((await decision('autre', 'x')).json.data.erreurs).toHaveProperty('type')
    expect((await decision('departage', 'Égalité : l\'organisateur départage.')).statut).toBe(200)
    expect((await decision('departage', 'Encore.')).statut).toBe(409)
    expect((await admin.from('decision').select('type, justification').eq('participation_id', pA)).data).toEqual([{ type: 'departage', justification: 'Égalité : l\'organisateur départage.' }])
    expect((await page(`/admin/campagnes/${slug}`, orga)).texte).toContain('Égalité : l&#39;organisateur départage.')

    // Fermeture de compte : la base ferme le compte du candidat.
    expect((await decision('fermeture_compte', 'Fausse déclaration établie.', pB)).statut).toBe(200)
    expect((await admin.from('compte').select('etat').eq('id', B.id).single()).data?.etat).toBe('ferme')
  })

  it('refuse la publication tant qu\'un vote manque, l\'accepte ensuite, puis archive dans l\'ordre', async () => {
    expect((await statut('publiee')).statut).toBe(409) // hors ordre : encore en délibération
    expect((await statut('prete')).statut).toBe(200)
    const refus = await statut('publiee')
    expect(refus.statut).toBe(409)
    expect(refus.json.statusMessage).toContain('vote du Boss')

    expect((await appeler('PUT', `/api/admin/participations/${pB}/vote`, orga, { note: 5, commentaire: '' })).statut).toBe(200)
    expect((await appeler('POST', `/api/admin/participations/${pB}/verrouillage`, orga)).statut).toBe(200)
    expect((await statut('publiee')).statut).toBe(200)
    expect((await appeler('GET', `/api/campagnes/${slug}`)).json).toMatchObject({ statut: 'publiee' })
    expect((await statut('archivee')).statut).toBe(200)
    expect((await statut('brouillon')).statut).toBe(409) // on ne revient pas en arrière
  })
})

const HTML = '<script>alert(1)</script> et <img src=x onerror=alert(1)>'
const ECHAPPE = '&lt;script&gt;alert(1)&lt;/script&gt;'
const sansHtmlActif = (html: string) => {
  expect(html).toContain(ECHAPPE)
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  expect(html).not.toContain('<script>alert(1)')
  expect(html).not.toContain('<img src=x')
}

describe('textes saisis contenant du HTML : acceptés, stockés tels quels, rendus échappés', () => {
  it('motivation (profil), lue par l\'organisateur', async () => {
    const u = await candidat('verifie')
    expect((await appeler('PATCH', '/api/compte', u, { motivation: HTML })).statut).toBe(200)
    expect((await admin.from('compte').select('motivation').eq('id', u.id).single()).data?.motivation).toBe(HTML)
    const liste = (await appeler('GET', '/api/admin/comptes', orga)).json as unknown as { comptes: { id: string; motivation: string }[] }
    expect(liste.comptes.find((c) => c.id === u.id)?.motivation).toBe(HTML)
    sansHtmlActif((await page('/admin/comptes', orga)).texte)
  })

  it('présentation de dépôt, brief de campagne et commentaire de vote', async () => {
    const slug = 'html-' + randomBytes(5).toString('hex')
    const criteres = [{ cle: 'brief', libelle: 'Réponse au brief', poids: 100, jure: 'pitch' }]
    const creation = await appeler('POST', '/api/admin/campagnes', orga, {
      slug, titre: 'Titre', theme: 'Thème', brief: HTML, criteres, ouverture_inscriptions: jours(-1), cloture_depot: jours(7), date_resultats: jours(14), max_participants: 5,
    })
    expect(creation.statut).toBe(200)
    const { data: c } = await admin.from('campagne').select('id, brief').eq('slug', slug).single()
    expect(c!.brief).toBe(HTML)
    expect((await appeler('POST', `/api/admin/campagnes/${slug}/statut`, orga, { statut: 'inscriptions' })).statut).toBe(200)
    sansHtmlActif((await page(`/campagnes/${slug}`)).texte)

    // Dépôt : la présentation passe la validation, est stockée telle quelle et sort échappée côté administration.
    const u = await candidat()
    expect((await u.client.rpc('sinscrire', { p_campagne_id: c!.id })).error).toBeNull()
    const declaration = { presentation: HTML, demande: '', type_code: 'open_source', declaration_code: true, aucun_outil: true, outils_ia: [], contact_reutilisation: false }
    const url = await appeler('POST', `/api/campagnes/${slug}/depot/url`, u, declaration)
    expect(url.statut).toBe(200)
    const { chemin, token } = url.json as { chemin: string; token: string }
    expect((await anon().storage.from('depots').uploadToSignedUrl(chemin, token, zip())).error).toBeNull()
    expect((await appeler('POST', `/api/campagnes/${slug}/depot`, u, { ...declaration, chemin })).statut).toBe(200)
    const { data: p } = await admin.from('participation').select('id').eq('campagne_id', c!.id).single()
    expect((await admin.from('reception').select('presentation').eq('participation_id', p!.id).single()).data?.presentation).toBe(HTML)

    // Vote : la campagne passe en délibération, la réception est simulée acceptée avec son dépôt.
    for (const s of ['depot', 'deliberation']) expect((await appeler('POST', `/api/admin/campagnes/${slug}/statut`, orga, { statut: s })).statut).toBe(200)
    await admin.from('depot').insert({ participation_id: p!.id, sha256: 'b'.repeat(64), taille_octets: 22, nb_fichiers: 1, nb_tokens: 1, presentation: HTML, type_code: 'open_source', licence_presente: true, declaration_code_le: maintenant() })
    const vote = await appeler('PUT', `/api/admin/participations/${p!.id}/vote`, orga, { note: 5, commentaire: HTML })
    expect(vote.statut).toBe(200)
    expect((await admin.from('vote_boss').select('commentaire').eq('participation_id', p!.id).single()).data?.commentaire).toBe(HTML)
    const detail = await page(`/admin/campagnes/${slug}`, orga)
    sansHtmlActif(detail.texte)
    // Le brief et la présentation ne sont pas non plus servis comme HTML par l'API d'administration.
    expect(((await appeler('GET', `/api/admin/campagnes/${slug}`, orga)).json as unknown as { participations: { depot: { presentation: string } }[] }).participations[0]!.depot.presentation).toBe(HTML)
  })

  it('la CSP reste stricte (nonce, aucun unsafe-inline)', async () => {
    const csp = (await fetch(serveur.url + '/')).headers.get('content-security-policy') ?? ''
    expect(csp).toMatch(/script-src [^;]*'nonce-/)
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).toContain("script-src-attr 'none'")
  })

  it('le lien du dépôt cité est limité à https:// par la base', async () => {
    const u = await candidat()
    for (const url of ['javascript:alert(1)', 'http://example.org', 'data:text/html,x']) {
      expect((await admin.from('compte').update({ depot_cite_url: url }).eq('id', u.id)).error?.code, url).toBe('23514')
      expect((await u.client.from('compte').update({ depot_cite_url: url }).eq('id', u.id)).error?.code, url).toBe('23514')
    }
  })
})

describe('sortie du serveur', () => {
  it('les pages d\'administration rendues côté serveur n\'écrivent aucune erreur', async () => {
    const c = await campagneService('deliberation')
    const avant = serveur.sortie().length
    for (const p of [...PAGES.slice(0, 4), `/admin/campagnes/${c.slug}`]) expect((await page(p, orga)).statut, p).toBe(200)
    expect(serveur.sortie().slice(avant)).not.toMatch(/error|erreur|exception|warn/i)
  })
})

type DetailCampagne = import('../../shared/utils/admin').DetailCampagne
