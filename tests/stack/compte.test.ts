// Tests d'intégration contre la pile Supabase locale (pnpm stack:start) et le serveur Nuxt construit.
// GitHub est simulé par un petit serveur local : aucun appel réseau réel.
import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creerJeton } from '../../server/utils/jeton'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, api as apiBase, demarrer as demarrerBase, nettoyer, statut, utilisateur } from './aide'

const MAIL = statut.MAILPIT_URL as string

// --- GitHub simulé ---
let githubEnPanne = false
const appelsGithub: string[] = []
const github: Server = createServer((req, res) => {
  appelsGithub.push(req.url ?? '')
  res.setHeader('content-type', 'application/json')
  if (githubEnPanne) return void res.writeHead(500).end('{}')
  if (req.url?.startsWith('/user/')) {
    return void res.end(JSON.stringify({ login: `gh-${req.url.slice(6)}`, created_at: '2015-03-01T10:00:00Z', public_repos: 12 }))
  }
  res.end(JSON.stringify([{ created_at: '2026-11-20T08:00:00Z' }, { created_at: '2026-11-19T08:00:00Z' }]))
})

// --- Serveur Nuxt ---
type Serveur = Awaited<ReturnType<typeof demarrerBase>>
const demarrer = (port: number, env: Record<string, string>) => demarrerBase(port, {
  NUXT_SECRET_VERIFICATION: SECRET,
  NUXT_SMTP_HOST: '127.0.0.1',
  NUXT_SMTP_PORT: '54425',
  NUXT_GITHUB_API: `http://127.0.0.1:${(github.address() as AddressInfo).port}`,
  ...env,
})

let serveur: Serveur
let serveurSansCharte: Serveur
const SECRET = 'secret-de-test-' + randomBytes(16).toString('hex')

beforeAll(async () => {
  await new Promise<void>((ok) => github.listen(0, '127.0.0.1', ok))
  serveur = await demarrer(3411, { NUXT_VERSION_CHARTE: '2026-12-01' })
  serveurSansCharte = await demarrer(3412, { NUXT_VERSION_CHARTE: '' })
})
afterAll(async () => {
  serveur?.arreter()
  serveurSansCharte?.arreter()
  github.close()
  await nettoyer() // supprime aussi la ligne compte (cascade)
})

const formulaire = (surcharge: Record<string, unknown> = {}) => ({
  vrai_nom: 'Ada Lovelace',
  pseudo: 'ada' + randomBytes(4).toString('hex'),
  email_contact: `contact-${randomBytes(5).toString('hex')}@example.org`,
  motivation: 'Je code des outils.\nJe candidate pour progresser.',
  depot_cite_url: 'https://github.com/ada/moteur',
  charte: true,
  majeur: true,
  ...surcharge,
})

const api = (methode: string, chemin: string, u?: Parameters<typeof apiBase>[3], corps?: unknown, base = serveur.url) =>
  apiBase(base, methode, chemin, u, corps)

const jetonDuLien = (lien: string) => new URL(lien).searchParams.get('jeton')!
// Confirmation par le POST de la page /compte/verifier ; renvoie ok, expire ou invalide.
const confirmer = async (jeton: string) => (await api('POST', '/api/compte/verifier', undefined, { jeton })).json.resultat

const ligne = async (id: string) => (await admin.from('compte').select('*').eq('id', id).maybeSingle()).data

// Dernier e-mail reçu à cette adresse dans la boîte locale, une fois `n` messages arrivés.
async function courriel(adresse: string, n = 1) {
  for (let i = 0; i < 50; i++) {
    const { messages } = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${adresse}`)}`)).json()
    if (messages.length >= n) {
      const m = await (await fetch(`${MAIL}/api/v1/message/${messages[0].ID}`)).json()
      return { from: m.From.Address as string, sujet: m.Subject as string, texte: m.Text as string, lien: /http\S+jeton=\S+/.exec(m.Text)?.[0] ?? '' }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Aucun e-mail pour ${adresse}`)
}

describe('création du compte', () => {
  it('crée le compte d\'un utilisateur GitHub : profil, charte, majorité, données GitHub lues côté serveur', async () => {
    const u = await utilisateur()
    const f = formulaire()
    const r = await api('POST', '/api/compte', u, f)
    expect(r.statut).toBe(200)
    expect(r.json.courrielEnvoye).toBe(true)
    const c = await ligne(u.id)
    expect(c).toMatchObject({
      github_id: u.githubId,
      vrai_nom: f.vrai_nom,
      pseudo: f.pseudo,
      email_contact: f.email_contact,
      etat: 'email_a_verifier',
      role: 'candidat',
      version_charte: '2026-12-01',
    })
    expect(c!.majeur_declare_le).toBeTruthy()
    expect(c!.charte_acceptee_le).toBeTruthy()
    expect(c!.github_donnees).toMatchObject({ login: `gh-${u.githubId}`, depots_publics: 12, compte_cree_le: '2015-03-01T10:00:00Z', derniere_activite: '2026-11-20T08:00:00Z' })
    expect(appelsGithub).toContain(`/user/${u.githubId}`)
  })

  it('ignore github_id, état et rôle envoyés dans le corps, et ne lit pas user_metadata', async () => {
    const u = await utilisateur()
    const r = await api('POST', '/api/compte', u, { ...formulaire(), github_id: '424242', etat: 'autorise', role: 'organisateur', id: crypto.randomUUID() })
    expect(r.statut).toBe(200)
    const c = await ligne(u.id)
    expect(c).toMatchObject({ github_id: u.githubId, etat: 'email_a_verifier', role: 'candidat' })
    expect(c!.github_id).not.toBe('faux-id-modifiable')
  })

  it('refuse sans session', async () => {
    expect((await api('POST', '/api/compte', undefined, formulaire())).statut).toBe(401)
  })

  it('refuse un utilisateur dont le fournisseur n\'est pas GitHub', async () => {
    const u = await utilisateur({ provider: 'email' })
    const r = await api('POST', '/api/compte', u, formulaire())
    expect(r.statut).toBe(403)
    expect(await ligne(u.id)).toBeNull()
  })

  it('refuse un second compte pour la même identité GitHub, et un second compte du même utilisateur', async () => {
    const a = await utilisateur()
    expect((await api('POST', '/api/compte', a, formulaire())).statut).toBe(200)
    const b = await utilisateur({ githubId: a.githubId })
    const doublon = await api('POST', '/api/compte', b, formulaire())
    expect(doublon.statut).toBe(409)
    expect(await ligne(b.id)).toBeNull()
    expect((await api('POST', '/api/compte', a, formulaire())).statut).toBe(409)
  })

  it('refuse un pseudo déjà pris (sans tenir compte de la casse)', async () => {
    const a = await utilisateur()
    const f = formulaire()
    await api('POST', '/api/compte', a, f)
    const b = await utilisateur()
    const r = await api('POST', '/api/compte', b, formulaire({ pseudo: f.pseudo.toUpperCase() }))
    expect(r.statut).toBe(409)
    expect(r.json.data.erreurs).toHaveProperty('pseudo')
  })

  it('valide le formulaire côté serveur : cases, adresse jetable', async () => {
    const u = await utilisateur()
    const sansCases = await api('POST', '/api/compte', u, formulaire({ charte: false, majeur: false }))
    expect(sansCases.statut).toBe(422)
    expect(Object.keys(sansCases.json.data.erreurs).sort()).toEqual(['charte', 'majeur'])
    const jetable = await api('POST', '/api/compte', u, formulaire({ email_contact: 'x@mailinator.com' }))
    expect(jetable.statut).toBe(422)
    expect(jetable.json.data.erreurs).toHaveProperty('email_contact')
    expect(await ligne(u.id)).toBeNull()
  })

  it('un échec de GitHub ne bloque pas la création', async () => {
    githubEnPanne = true
    try {
      const u = await utilisateur()
      expect((await api('POST', '/api/compte', u, formulaire())).statut).toBe(200)
      expect((await ligne(u.id))!.github_donnees).toBeNull()
    } finally {
      githubEnPanne = false
    }
  })

  it('répond par une erreur claire si la version de la charte n\'est pas configurée', async () => {
    const u = await utilisateur()
    const r = await api('POST', '/api/compte', u, formulaire(), serveurSansCharte.url)
    expect(r.statut).toBe(503)
    expect(r.json.statusMessage).toContain('NUXT_VERSION_CHARTE')
    expect(await ligne(u.id)).toBeNull()
  })
})

describe('vérification de l\'e-mail', () => {
  it('envoie le lien depuis l\'expéditeur de Code Tank ; un GET sur le lien ne vérifie rien, le POST de confirmation si', async () => {
    const u = await utilisateur()
    const f = formulaire()
    await api('POST', '/api/compte', u, f)
    const mail = await courriel(f.email_contact)
    expect(mail.from).toBe('code-tank@ybdn.io')
    expect(mail.texte).toContain('24 heures')
    expect(mail.lien).toBe(`${serveur.url}/compte/verifier?jeton=${jetonDuLien(mail.lien)}`)

    // Ouvrir le lien (aperçu, antivirus) affiche la page avec son bouton et ne modifie rien.
    const page = await fetch(mail.lien)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Confirmer mon adresse')
    expect(await ligne(u.id)).toMatchObject({ etat: 'email_a_verifier', email_verifie_le: null })
    // L'ancienne route GET n'existe plus.
    expect((await api('GET', `/api/compte/verifier?jeton=${jetonDuLien(mail.lien)}`)).statut).toBeGreaterThanOrEqual(400)
    expect(await ligne(u.id)).toMatchObject({ etat: 'email_a_verifier', email_verifie_le: null })

    expect(await confirmer(jetonDuLien(mail.lien))).toBe('ok')
    const c = await ligne(u.id)
    expect(c!.etat).toBe('verifie')
    expect(c!.email_verifie_le).toBeTruthy()
    // Second clic : toujours « ok », l'état ne bouge pas.
    expect(await confirmer(jetonDuLien(mail.lien))).toBe('ok')
  })

  it('refuse un jeton falsifié, absent ou expiré', async () => {
    expect(await confirmer('abc.def')).toBe('invalide')
    expect((await api('POST', '/api/compte/verifier', undefined, {})).json.resultat).toBe('invalide')
    const u = await utilisateur()
    const f = formulaire()
    await api('POST', '/api/compte', u, f)
    const vieux = creerJeton(u.id, f.email_contact, SECRET, Date.now() - 25 * 3600_000)
    expect(await confirmer(vieux)).toBe('expire')
    expect((await ligne(u.id))!.email_verifie_le).toBeNull()
  })

  it('changer d\'adresse annule la vérification, renvoie un lien, et rend l\'ancien lien caduc', async () => {
    const u = await utilisateur()
    const f = formulaire()
    await api('POST', '/api/compte', u, f)
    const ancien = await courriel(f.email_contact)
    await confirmer(jetonDuLien(ancien.lien))
    expect((await ligne(u.id))!.email_verifie_le).toBeTruthy()

    const nouvelle = `nouvelle-${randomBytes(5).toString('hex')}@example.org`
    const r = await api('PATCH', '/api/compte', u, { email_contact: nouvelle })
    expect(r.statut).toBe(200)
    expect(r.json.courrielEnvoye).toBe(true)
    const apres = await ligne(u.id)
    expect(apres).toMatchObject({ email_contact: nouvelle, email_verifie_le: null, etat: 'verifie' })

    expect(await confirmer(jetonDuLien(ancien.lien))).toBe('invalide')
    expect((await ligne(u.id))!.email_verifie_le).toBeNull()
    const mail = await courriel(nouvelle)
    expect(await confirmer(jetonDuLien(mail.lien))).toBe('ok')
    expect((await ligne(u.id))!.email_verifie_le).toBeTruthy()
  })

  it('refuse une adresse jetable ou malformée à la modification', async () => {
    const u = await utilisateur()
    await api('POST', '/api/compte', u, formulaire())
    expect((await api('PATCH', '/api/compte', u, { email_contact: 'x@mailinator.com' })).statut).toBe(422)
    expect((await api('PATCH', '/api/compte', u, { email_contact: 'a@example.org,b@example.org' })).statut).toBe(422)
  })

  it('une adresse malformée écrite en direct par l\'API ne déclenche ni e-mail ni validation', async () => {
    const u = await utilisateur()
    await api('POST', '/api/compte', u, formulaire())
    const premiere = `x-${randomBytes(5).toString('hex')}@example.org`
    const mal = `${premiere},y-${randomBytes(5).toString('hex')}@example.org`
    // Écriture directe : la base ne contrôle que la longueur.
    expect((await u.client.from('compte').update({ email_contact: mal }).eq('id', u.id)).error).toBeNull()

    const renvoi = await api('POST', '/api/compte/verification', u)
    expect(renvoi.statut).toBe(422)
    const { messages } = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${premiere}`)}`)).json()
    expect(messages).toHaveLength(0)

    // Un jeton valide signé pour cette adresse ne la valide pas non plus.
    expect(await confirmer(creerJeton(u.id, mal, SECRET))).toBe('invalide')
    expect((await ligne(u.id))!.email_verifie_le).toBeNull()
  })

  it('renvoie le lien tant que l\'adresse n\'est pas vérifiée, puis refuse', async () => {
    const u = await utilisateur()
    const f = formulaire()
    await api('POST', '/api/compte', u, f)
    expect((await api('POST', '/api/compte/verification', u)).statut).toBe(200)
    const mail = await courriel(f.email_contact, 2)
    await confirmer(jetonDuLien(mail.lien))
    expect((await api('POST', '/api/compte/verification', u)).statut).toBe(409)
    expect((await api('POST', '/api/compte/verification')).statut).toBe(401)
  })
})

describe('droits sur le compte, par l\'API et la session de l\'utilisateur', () => {
  it('un candidat ne lit ni ne modifie le compte d\'un autre, et n\'écrit ni état ni rôle', async () => {
    const a = await utilisateur()
    const b = await utilisateur()
    const fa = formulaire()
    await api('POST', '/api/compte', a, fa)
    await api('POST', '/api/compte', b, formulaire())

    const lu = await b.client.from('compte').select('id, vrai_nom')
    expect(lu.data).toEqual([expect.objectContaining({ id: b.id })])
    expect((await b.client.from('compte').select('vrai_nom').eq('id', a.id)).data).toEqual([])

    const maj = await b.client.from('compte').update({ vrai_nom: 'Pirate' }).eq('id', a.id).select()
    expect(maj.data).toEqual([])
    expect((await ligne(a.id))!.vrai_nom).toBe(fa.vrai_nom)

    expect((await b.client.from('compte').update({ etat: 'autorise' }).eq('id', b.id)).error).not.toBeNull()
    expect((await b.client.from('compte').update({ role: 'organisateur' }).eq('id', b.id)).error).not.toBeNull()
    expect((await b.client.from('compte').update({ github_id: '1' }).eq('id', b.id)).error).not.toBeNull()
    expect((await ligne(b.id))).toMatchObject({ etat: 'email_a_verifier', role: 'candidat' })
  })

  it('le pseudo est figé une fois le compte autorisé, les autres champs restent modifiables', async () => {
    const u = await utilisateur()
    const f = formulaire()
    await api('POST', '/api/compte', u, f)
    // Décision de l'organisateur simulée par l'administrateur de la base.
    await admin.from('compte').update({ etat: 'autorise' }).eq('id', u.id)

    const pseudo = await api('PATCH', '/api/compte', u, { pseudo: 'autre-pseudo' })
    expect(pseudo.statut).toBe(409)
    expect(pseudo.json.data.erreurs).toHaveProperty('pseudo')
    expect((await ligne(u.id))!.pseudo).toBe(f.pseudo)

    const direct = await u.client.from('compte').update({ pseudo: 'autre-pseudo' }).eq('id', u.id)
    expect(direct.error?.message).toContain('pseudo ne se modifie plus')

    expect((await api('PATCH', '/api/compte', u, { motivation: 'Nouvelle motivation' })).statut).toBe(200)
    expect((await ligne(u.id))!.motivation).toBe('Nouvelle motivation')
  })
})
