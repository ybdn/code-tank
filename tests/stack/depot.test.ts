// Inscription, dépôt, reçu, retrait et désinscription contre la pile Supabase locale (stockage compris)
// et le serveur Nuxt construit. Le contrôle du zip n'existe pas ici : les tests le simulent par la clé de service.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anon, API, api, campagne, demarrer, inscrire, nettoyer, utilisateur, zip, type Utilisateur } from './aide'

let serveur: { url: string; arreter: () => void }
const appeler = (m: string, c: string, u?: Utilisateur, corps?: unknown) => api(serveur.url, m, c, u, corps)
const stockage = () => admin.storage.from('depots')
const existe = async (chemin: string) => (await stockage().exists(chemin)).data

beforeAll(async () => {
  serveur = await demarrer(3413)
})
afterAll(async () => {
  serveur?.arreter()
  await nettoyer()
})

const declaration = (surcharge: Record<string, unknown> = {}) => ({
  presentation: 'Un minuteur en Rust, dont je suis fier.',
  demande: 'Je vise 8/10',
  type_code: 'open_source',
  declaration_code: true,
  aucun_outil: false,
  outils_ia: ['Claude Code'],
  contact_reutilisation: true,
  ...surcharge,
})

// Dépôt complet : URL signée, envoi direct au stockage, enregistrement. Renvoie le chemin de l'archive.
async function deposer(slug: string, u: Utilisateur, surcharge: Record<string, unknown> = {}) {
  const url = await appeler('POST', `/api/campagnes/${slug}/depot/url`, u, declaration(surcharge))
  expect(url.statut).toBe(200)
  const { chemin, token } = url.json as { chemin: string; token: string }
  const envoi = await anon().storage.from('depots').uploadToSignedUrl(chemin, token, zip())
  expect(envoi.error).toBeNull()
  const r = await appeler('POST', `/api/campagnes/${slug}/depot`, u, { ...declaration(surcharge), chemin })
  expect(r.statut).toBe(200)
  return chemin
}

const reception = async (participationId: string) =>
  (await admin.from('reception').select('*').eq('participation_id', participationId).maybeSingle()).data

describe('inscription et désinscription', () => {
  it('un compte autorisé s\'inscrit par l\'API, une seule fois ; les places restantes suivent', async () => {
    const c = await campagne('inscriptions', { max: 2 })
    const u = await utilisateur()
    const places = async () => (await anon().from('places_campagne').select('places_restantes').eq('campagne_id', c.id).single()).data?.places_restantes
    expect(await places()).toBe(2)
    expect((await u.client.rpc('sinscrire', { p_campagne_id: c.id })).error).toBeNull()
    expect(await places()).toBe(1)
    expect((await u.client.rpc('sinscrire', { p_campagne_id: c.id })).error?.message).toContain('déjà inscrit')
  })

  it('refuse un compte non autorisé', async () => {
    const c = await campagne('inscriptions')
    const u = await utilisateur('verifie')
    expect((await u.client.rpc('sinscrire', { p_campagne_id: c.id })).error?.message).toContain('pas autorisé')
    expect((await anon().rpc('sinscrire', { p_campagne_id: c.id })).error).not.toBeNull()
  })

  it('se désinscrire retire la participation, la réception et l\'archive', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    expect((await u.client.rpc('sinscrire', { p_campagne_id: c.id })).error).toBeNull()
    const chemin = await deposer(c.slug, u)
    const { data: p } = await admin.from('participation').select('id').eq('campagne_id', c.id).single()
    expect(await reception(p!.id)).not.toBeNull()

    expect((await appeler('DELETE', `/api/campagnes/${c.slug}/inscription`, u)).statut).toBe(200)
    expect((await admin.from('participation').select('etat').eq('id', p!.id).single()).data?.etat).toBe('retire')
    expect(await reception(p!.id)).toBeNull()
    expect(await existe(chemin)).toBe(false)
    expect((await appeler('DELETE', `/api/campagnes/${c.slug}/inscription`, u)).statut).toBe(403)
    // Il peut se réinscrire tant qu'il reste des places.
    expect((await u.client.rpc('sinscrire', { p_campagne_id: c.id })).error).toBeNull()
  })

  it('la désinscription supprime aussi le dépôt accepté et son archive ; refusée une fois la délibération commencée', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    const pid = await inscrire(c, u)
    const chemin = await deposer(c.slug, u)
    await admin.from('depot').insert({
      participation_id: pid, chemin_stockage: chemin, sha256: 'a'.repeat(64), taille_octets: 22, nb_fichiers: 3, nb_tokens: 100,
      presentation: 'x', type_code: 'open_source', licence_presente: true, declaration_code_le: new Date().toISOString(),
    })
    expect((await appeler('DELETE', `/api/campagnes/${c.slug}/inscription`, u)).statut).toBe(200)
    expect((await admin.from('depot').select('id').eq('participation_id', pid)).data).toEqual([])
    expect(await existe(chemin)).toBe(false)

    const d = await campagne('deliberation')
    const v = await utilisateur()
    const pv = await inscrire(d, v)
    const cheminV = `${d.id}/${pv}/${crypto.randomUUID()}.zip`
    await stockage().upload(cheminV, zip())
    await admin.from('reception').insert({ participation_id: pv, chemin_stockage: cheminV, presentation: 'x', type_code: 'open_source', declaration_code_le: new Date().toISOString() })
    const refus = await appeler('DELETE', `/api/campagnes/${d.slug}/inscription`, v)
    expect(refus.statut).toBe(409)
    expect(await reception(pv)).not.toBeNull()
    expect(await existe(cheminV)).toBe(true)
  })
})

describe('URL d\'envoi : qui peut déposer', () => {
  it('refuse sans session', async () => {
    const c = await campagne('depot')
    expect((await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, undefined, declaration())).statut).toBe(401)
    expect((await appeler('POST', `/api/campagnes/${c.slug}/depot`, undefined, { ...declaration(), chemin: 'x' })).statut).toBe(401)
  })

  it('refuse un compte non inscrit, sans compte, ou non autorisé (même inscrit)', async () => {
    const c = await campagne('depot')
    const nonInscrit = await utilisateur()
    expect((await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, nonInscrit, declaration())).statut).toBe(403)
    const sansCompte = await utilisateur(null)
    expect((await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, sansCompte, declaration())).statut).toBe(403)
    const ferme = await utilisateur()
    await inscrire(c, ferme)
    await admin.from('compte').update({ etat: 'ferme' }).eq('id', ferme.id)
    const r = await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, ferme, declaration())
    expect(r.statut).toBe(403)
    expect(r.json.statusMessage).toContain('pas autorisé')
    expect(r.json.token).toBeUndefined()
  })

  it('refuse hors statut, après la clôture, et pour une campagne inconnue ou en brouillon', async () => {
    const u = await utilisateur()
    const delib = await campagne('deliberation')
    await inscrire(delib, u)
    expect((await appeler('POST', `/api/campagnes/${delib.slug}/depot/url`, u, declaration())).statut).toBe(409)

    const close = await campagne('depot', { cloture: new Date(Date.now() - 3600_000) })
    await inscrire(close, u)
    const r = await appeler('POST', `/api/campagnes/${close.slug}/depot/url`, u, declaration())
    expect(r.statut).toBe(409)
    expect(r.json.statusMessage).toContain('date limite')

    const brouillon = await campagne('brouillon')
    expect((await appeler('POST', `/api/campagnes/${brouillon.slug}/depot/url`, u, declaration())).statut).toBe(404)
    expect((await appeler('POST', '/api/campagnes/inconnue/depot/url', u, declaration())).statut).toBe(404)
  })

  it('refuse le dépôt enregistré après la clôture, même si l\'archive est partie avant', async () => {
    const c = await campagne('depot', { cloture: new Date(Date.now() + 4000) })
    const u = await utilisateur()
    await inscrire(c, u)
    const { chemin, token } = (await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, u, declaration())).json as { chemin: string; token: string }
    await anon().storage.from('depots').uploadToSignedUrl(chemin, token, zip())
    await new Promise((r) => setTimeout(r, 4500))
    expect((await appeler('POST', `/api/campagnes/${c.slug}/depot`, u, { ...declaration(), chemin })).statut).toBe(409)
  })

  it('autorise le dépôt pendant la phase inscriptions (elle chevauche le dépôt)', async () => {
    const c = await campagne('inscriptions')
    const u = await utilisateur()
    await inscrire(c, u)
    await deposer(c.slug, u)
  })

  it('refuse une déclaration invalide, sans délivrer d\'URL', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    await inscrire(c, u)
    const cas: [string, Record<string, unknown>, string][] = [
      ['présentation vide', { presentation: '  ' }, 'presentation'],
      ['présentation trop longue', { presentation: 'a'.repeat(501) }, 'presentation'],
      ['demande trop longue', { demande: 'b'.repeat(81) }, 'demande'],
      ['licence non cochée', { declaration_code: false }, 'declaration_code'],
      ['licence absente', { declaration_code: undefined }, 'declaration_code'],
      ['type de code inconnu', { type_code: 'autre' }, 'type_code'],
      ['outils d\'IA ni listés ni « aucun »', { outils_ia: [], aucun_outil: false }, 'outils_ia'],
    ]
    for (const [nom, surcharge, champ] of cas) {
      const r = await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, u, declaration(surcharge))
      expect(r.statut, nom).toBe(422)
      expect(r.json.data?.erreurs, nom).toHaveProperty(champ)
      expect(r.json.token, nom).toBeUndefined()
    }
    // Un envoi valide mais une déclaration refusée à l'enregistrement : rien n'est enregistré.
    const { chemin, token } = (await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, u, declaration())).json as { chemin: string; token: string }
    await anon().storage.from('depots').uploadToSignedUrl(chemin, token, zip())
    const r = await appeler('POST', `/api/campagnes/${c.slug}/depot`, u, { ...declaration({ declaration_code: false }), chemin })
    expect(r.statut).toBe(422)
    const { data: p } = await admin.from('participation').select('id').eq('campagne_id', c.id).single()
    expect(await reception(p!.id)).toBeNull()
  })
})

describe('envoi au stockage et réception', () => {
  it('envoie un petit zip par l\'URL signée, puis la réception est en attente avec la déclaration', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    const pid = await inscrire(c, u)
    const chemin = await deposer(c.slug, u)
    expect(chemin).toMatch(new RegExp(`^${c.id}/${pid}/[0-9a-f-]{36}\\.zip$`))
    expect(await existe(chemin)).toBe(true)

    const r = await reception(pid)
    expect(r).toMatchObject({
      chemin_stockage: chemin, etat: 'en_attente', presentation: 'Un minuteur en Rust, dont je suis fier.', demande: 'Je vise 8/10',
      type_code: 'open_source', outils_ia: ['Claude Code'], contact_reutilisation: true, motifs_refus: [], traitee_le: null,
    })
    expect(r!.declaration_code_le).toBeTruthy()
    // Le candidat lit sa réception par la vue, jamais le chemin.
    const { data } = await u.client.from('ma_reception').select('*').single()
    expect(data).toMatchObject({ etat: 'en_attente', presentation: 'Un minuteur en Rust, dont je suis fier.' })
    expect(data).not.toHaveProperty('chemin_stockage')
    expect((await u.client.from('reception').select('chemin_stockage')).data).toEqual([])
  })

  it('« aucun » outil d\'IA est une déclaration valide', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    const pid = await inscrire(c, u)
    await deposer(c.slug, u, { aucun_outil: true, outils_ia: [], demande: '' })
    expect(await reception(pid)).toMatchObject({ outils_ia: [], demande: null })
  })

  it('le stockage refuse un fichier trop gros et un fichier d\'un autre type', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    await inscrire(c, u)
    const url = async () => (await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, u, declaration())).json as { chemin: string; token: string }

    const gros = await url()
    const rGros = await anon().storage.from('depots').uploadToSignedUrl(gros.chemin, gros.token, zip(20 * 1024 * 1024 + 1))
    expect(rGros.error).not.toBeNull()
    expect(await existe(gros.chemin)).toBe(false)

    const autre = await url()
    const rAutre = await anon().storage.from('depots').uploadToSignedUrl(autre.chemin, autre.token, new Blob(['hello'], { type: 'text/plain' }))
    expect(rAutre.error).not.toBeNull()
    expect(await existe(autre.chemin)).toBe(false)

    // Exactement 20 Mo passe.
    const limite = await url()
    expect((await anon().storage.from('depots').uploadToSignedUrl(limite.chemin, limite.token, zip(20 * 1024 * 1024))).error).toBeNull()
  })

  it('un jeton d\'envoi ne sert qu\'une fois : un second envoi au même chemin est refusé', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    await inscrire(c, u)
    const { chemin, token } = (await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, u, declaration())).json as { chemin: string; token: string }
    expect((await anon().storage.from('depots').uploadToSignedUrl(chemin, token, zip(30))).error).toBeNull()
    expect((await anon().storage.from('depots').uploadToSignedUrl(chemin, token, zip(40))).error).not.toBeNull()
    expect((await stockage().download(chemin)).data?.size).toBe(30)
  })

  it('refuse d\'enregistrer un envoi inconnu : archive absente, chemin d\'un autre, chemin mal formé', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    const pid = await inscrire(c, u)
    const autre = await utilisateur()
    const pAutre = await inscrire(c, autre)
    const cheminAutre = await deposer(c.slug, autre)

    const essais = [
      `${c.id}/${pid}/${crypto.randomUUID()}.zip`, // bien formé, mais rien n'a été envoyé
      cheminAutre, // l'archive d'un autre candidat
      `${c.id}/${pid}/../${pAutre}/x.zip`,
      `${c.id}/${pid}/${crypto.randomUUID()}.txt`,
      '',
    ]
    for (const chemin of essais) {
      const r = await appeler('POST', `/api/campagnes/${c.slug}/depot`, u, { ...declaration(), chemin })
      expect(r.statut, chemin).toBe(422)
    }
    expect(await reception(pid)).toBeNull()
    expect((await reception(pAutre))!.chemin_stockage).toBe(cheminAutre)
  })

  it('un candidat ne peut ni lister, ni lire, ni écraser, ni effacer un objet du bucket, pas même le sien', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    const pid = await inscrire(c, u)
    const chemin = await deposer(c.slug, u)
    const bucket = u.client.storage.from('depots')

    const liste = await bucket.list(`${c.id}/${pid}`)
    expect(liste.data ?? []).toEqual([])
    expect((await bucket.download(chemin)).error).not.toBeNull()
    expect((await bucket.createSignedUrl(chemin, 60)).error).not.toBeNull()
    expect((await bucket.upload(chemin, zip(99), { upsert: true })).error).not.toBeNull()
    expect((await bucket.upload(`${c.id}/${pid}/nouveau.zip`, zip())).error).not.toBeNull()
    expect((await bucket.createSignedUploadUrl(`${c.id}/${pid}/autre.zip`)).error).not.toBeNull()
    expect((await bucket.remove([chemin])).data ?? []).toEqual([])
    expect((await bucket.move(chemin, `${c.id}/${pid}/deplace.zip`)).error).not.toBeNull()
    // Le même refus pour un visiteur anonyme.
    const visiteur = anon().storage.from('depots')
    expect((await visiteur.download(chemin)).error).not.toBeNull()
    expect((await visiteur.upload(chemin, zip(99), { upsert: true })).error).not.toBeNull()
    // Et le bucket n'est pas public.
    expect((await fetch(`${API}/storage/v1/object/public/depots/${chemin}`)).status).toBeGreaterThanOrEqual(400)

    // L'objet est intact.
    expect((await stockage().download(chemin)).data?.size).toBe(22)
  })
})

describe('remplacement, états et reçu', () => {
  it('un second dépôt remplace le premier, et l\'ancienne archive (comme un envoi jamais confirmé) n\'existe plus', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    const pid = await inscrire(c, u)
    const premier = await deposer(c.slug, u)

    // Envoi abandonné : URL délivrée, archive envoyée, jamais enregistrée.
    const abandon = (await appeler('POST', `/api/campagnes/${c.slug}/depot/url`, u, declaration())).json as { chemin: string; token: string }
    await anon().storage.from('depots').uploadToSignedUrl(abandon.chemin, abandon.token, zip())
    expect(await existe(abandon.chemin)).toBe(true)

    const second = await deposer(c.slug, u, { presentation: 'Seconde version.' })
    expect(second).not.toBe(premier)
    expect(await existe(premier)).toBe(false)
    expect(await existe(abandon.chemin)).toBe(false)
    expect(await existe(second)).toBe(true)
    const lignes = (await admin.from('reception').select('chemin_stockage, presentation').eq('participation_id', pid)).data
    expect(lignes).toEqual([{ chemin_stockage: second, presentation: 'Seconde version.' }])
  })

  it('le candidat voit en_attente, refusee avec ses motifs, puis acceptee avec son reçu ; un nouvel envoi garde le dépôt accepté', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    const pid = await inscrire(c, u)
    const chemin = await deposer(c.slug, u)
    const etat = async () => (await u.client.from('ma_reception').select('etat, motifs_refus').single()).data

    expect((await etat())!.etat).toBe('en_attente')
    const motifs = [{ code: 'licence', message: 'Ajoute ta licence et redépose.' }]
    await admin.from('reception').update({ etat: 'refusee', motifs_refus: motifs, traitee_le: new Date().toISOString() }).eq('participation_id', pid)
    expect(await etat()).toEqual({ etat: 'refusee', motifs_refus: motifs })

    // Après un refus, il redépose : retour en attente, motifs effacés, ancienne archive effacée.
    const deuxieme = await deposer(c.slug, u)
    expect(await etat()).toEqual({ etat: 'en_attente', motifs_refus: [] })
    expect(await existe(chemin)).toBe(false)

    // Le contrôle simulé accepte : dépôt et reçu.
    await admin.from('reception').update({ etat: 'acceptee', traitee_le: new Date().toISOString() }).eq('participation_id', pid)
    await admin.from('depot').insert({
      participation_id: pid, chemin_stockage: deuxieme, sha256: 'ab'.repeat(32), taille_octets: 22, nb_fichiers: 12,
      fichiers_exclus: ['node_modules/x.js'], nb_tokens: 4321, presentation: 'x', type_code: 'open_source',
      licence_presente: true, declaration_code_le: new Date().toISOString(),
    })
    expect((await etat())!.etat).toBe('acceptee')
    const { data: recu } = await u.client.from('mon_depot').select('sha256, nb_fichiers, fichiers_exclus, nb_tokens, taille_octets').single()
    expect(recu).toEqual({ sha256: 'ab'.repeat(32), nb_fichiers: 12, fichiers_exclus: ['node_modules/x.js'], nb_tokens: 4321, taille_octets: 22 })

    // Il redépose : le dépôt accepté et son archive restent jusqu'au prochain contrôle.
    const troisieme = await deposer(c.slug, u)
    expect(await existe(deuxieme)).toBe(true)
    expect(await existe(troisieme)).toBe(true)
    expect((await etat())!.etat).toBe('en_attente')
    expect((await u.client.from('mon_depot').select('sha256').single()).data?.sha256).toBe('ab'.repeat(32))
  })
})

describe('retrait du dépôt', () => {
  it('efface le dépôt, la réception et les deux archives, et laisse l\'inscription', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    const pid = await inscrire(c, u)
    const acceptee = await deposer(c.slug, u)
    await admin.from('reception').update({ etat: 'acceptee', traitee_le: new Date().toISOString() }).eq('participation_id', pid)
    await admin.from('depot').insert({
      participation_id: pid, chemin_stockage: acceptee, sha256: 'c'.repeat(64), taille_octets: 22, nb_fichiers: 1, nb_tokens: 1,
      presentation: 'x', type_code: 'open_source', licence_presente: true, declaration_code_le: new Date().toISOString(),
    })
    const enAttente = await deposer(c.slug, u)

    expect((await appeler('DELETE', `/api/campagnes/${c.slug}/depot`, u)).statut).toBe(200)
    expect((await admin.from('depot').select('id').eq('participation_id', pid)).data).toEqual([])
    expect(await reception(pid)).toBeNull()
    expect(await existe(acceptee)).toBe(false)
    expect(await existe(enAttente)).toBe(false)
    expect((await admin.from('participation').select('etat').eq('id', pid).single()).data?.etat).toBe('inscrit')
    expect((await appeler('DELETE', `/api/campagnes/${c.slug}/depot`, u)).statut).toBe(404)
  })

  it('marche aussi quand il n\'existe qu\'une réception, sans dépôt accepté', async () => {
    const c = await campagne('depot')
    const u = await utilisateur()
    const pid = await inscrire(c, u)
    const chemin = await deposer(c.slug, u)
    expect((await appeler('DELETE', `/api/campagnes/${c.slug}/depot`, u)).statut).toBe(200)
    expect(await reception(pid)).toBeNull()
    expect(await existe(chemin)).toBe(false)
  })

  it('est refusé sans session, pour un non-inscrit, et une fois la délibération commencée (rien n\'est effacé)', async () => {
    const c = await campagne('depot')
    expect((await appeler('DELETE', `/api/campagnes/${c.slug}/depot`)).statut).toBe(401)
    expect((await appeler('DELETE', `/api/campagnes/${c.slug}/depot`, await utilisateur())).statut).toBe(403)

    const d = await campagne('deliberation')
    const u = await utilisateur()
    const pid = await inscrire(d, u)
    const chemin = `${d.id}/${pid}/${crypto.randomUUID()}.zip`
    await stockage().upload(chemin, zip())
    await admin.from('reception').insert({ participation_id: pid, chemin_stockage: chemin, presentation: 'x', type_code: 'open_source', declaration_code_le: new Date().toISOString() })
    expect((await appeler('DELETE', `/api/campagnes/${d.slug}/depot`, u)).statut).toBe(409)
    expect(await reception(pid)).not.toBeNull()
    expect(await existe(chemin)).toBe(true)
  })

  it('ne touche pas au dépôt d\'un autre candidat', async () => {
    const c = await campagne('depot')
    const a = await utilisateur()
    const b = await utilisateur()
    await inscrire(c, a)
    const pb = await inscrire(c, b)
    const chemin = await deposer(c.slug, b)
    expect((await appeler('DELETE', `/api/campagnes/${c.slug}/depot`, a)).statut).toBe(404)
    expect(await reception(pb)).not.toBeNull()
    expect(await existe(chemin)).toBe(true)
  })
})

describe('pages', () => {
  it('l\'accueil liste la campagne, la page de campagne rend le brief comme du texte, le brouillon reste caché', async () => {
    const c = await campagne('depot', { brief: '<script>alert(1)</script> & <b>gras</b>' })
    const brouillon = await campagne('brouillon')
    const accueil = await (await fetch(serveur.url + '/')).text()
    expect(accueil).toContain(`/campagnes/${c.slug}`)
    expect(accueil).not.toContain(`/campagnes/${brouillon.slug}`)

    const page = await fetch(`${serveur.url}/campagnes/${c.slug}`)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('Campagne de test')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).not.toContain('<b>gras</b>')
    expect(html).toContain('Réponse au brief')

    expect((await fetch(`${serveur.url}/campagnes/${brouillon.slug}`)).status).toBe(404)
    expect((await fetch(`${serveur.url}/campagnes/inconnue`)).status).toBe(404)
    expect((await fetch(`${serveur.url}/campagnes/${c.slug}/depot`)).status).toBe(200)
  })
})
