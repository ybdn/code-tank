// Écran de délibération, classement public, entretien et rapport du candidat, contre la pile locale et le serveur Nuxt construit.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anon, api, campagne as creerCampagne, candidat, demarrer, inscrire, nettoyer, type Utilisateur } from './aide'

let serveur: Awaited<ReturnType<typeof demarrer>>
const appeler = (c: string, u?: Utilisateur) => api(serveur.url, 'GET', c, u)
const page = async (c: string, u?: Utilisateur) => {
  const r = await fetch(serveur.url + c, { redirect: 'manual', headers: u ? { cookie: u.cookie } : {} })
  return { statut: r.status, texte: await r.text(), entetes: r.headers }
}
const maintenant = () => new Date().toISOString()

const HTML = '<img src=x onerror=alert(1)>'
const criteres = [
  { cle: 'securite', libelle: 'Sécurité', poids: 50, jure: 'sudo' },
  { cle: 'structure', libelle: 'Structure', poids: 30, jure: 'refacto' },
  { cle: 'outillage', libelle: 'Outillage et doc', poids: 20, jure: 'lint', calcule: true },
]
const audit = (jure: string, note: number, replique: string) => ({
  criteres: criteres.filter((c) => c.jure === jure && !('calcule' in c)).map((c) => ({
    cle: c.cle, note, justification: `Justification de ${c.cle} ${HTML}`, preuves: [{ fichier: 'src/minuteur.ts', ligne: 12, constat: `Constat ${HTML}` }],
  })),
  points_forts: ['Un point fort.'], a_ameliorer: ['Une piste.'], manipulation_detectee: { detectee: false, preuves: [] }, verdict: 'convaincu', replique,
})

let c: { id: string; slug: string }
let A: Utilisateur, B: Utilisateur, autre: Utilisateur
let pseudoA = ''
let sudoDeA = ''

beforeAll(async () => {
  serveur = await demarrer(3430)
  ;[A, B, autre] = [await candidat(), await candidat(), await candidat()]
  pseudoA = (await admin.from('compte').select('pseudo').eq('id', A.id).single()).data!.pseudo
  c = await creerCampagne('depot')
  await admin.from('campagne').update({ criteres }).eq('id', c.id)
  for (const [u, note, boss] of [[A, 8, 7], [B, 6, 5]] as const) {
    const pid = await inscrire(c, u)
    const base = { participation_id: pid, sha256: 'a'.repeat(64), taille_octets: 40, nb_fichiers: 3, nb_tokens: 1000, licence_presente: true, presentation: 'Un minuteur.', type_code: 'open_source' as const, declaration_code_le: maintenant() }
    const { data: d, error } = await admin.from('depot').insert({ ...base, note_outillage: note, demande: u === A ? 'Dites-moi si mon découpage tient.' : null }).select('id').single()
    if (error) throw error
    for (const jure of ['sudo', 'refacto', 'lint', 'pitch']) {
      const { data: a, error: e } = await admin.from('audit').insert({
        depot_id: d.id, jure, modele: 'modele-de-test', version_consignes: 'v-test', statut: 'termine', cout_usd: 0,
        resultat: audit(jure, note, `REPLIQUE-${jure.toUpperCase()}-${u === A ? 'A' : 'B'}`),
      }).select('id').single()
      if (e) throw e
      if (u === A && jure === 'sudo') sudoDeA = a.id
    }
    await admin.from('vote_boss').insert({ participation_id: pid, note: boss, commentaire: `CMT_BOSS_${u === A ? 'A' : 'B'} ${HTML}`, verrouille_le: maintenant() })
  }
  // Réplique de Sudo masquée pour A.
  await admin.from('audit').update({ replique_masquee: true }).eq('id', sudoDeA)
  for (const s of ['deliberation', 'prete']) await admin.from('campagne').update({ statut: s as 'prete' }).eq('id', c.id)
})
afterAll(async () => {
  serveur?.arreter()
  await nettoyer()
})

describe('pendant la délibération', () => {
  it('le classement est vide pour un anonyme et la page ne montre aucune note', async () => {
    expect((await anon().from('classement').select('pseudo').eq('campagne_id', c.id)).data).toEqual([])
    expect((await appeler(`/api/campagnes/${c.slug}/classement`)).json).toEqual([])
    const { statut, texte } = await page(`/campagnes/${c.slug}`)
    expect(statut).toBe(200)
    expect(texte).toContain('Le jury délibère')
    expect(texte).not.toMatch(/<table|podium|sur 10\b|sur 100\b|REPLIQUE|Justification/i)
    expect(texte).not.toContain(pseudoA)
  })

  it('ni le rapport ni l\'entretien ne sont lisibles, même de leur candidat', async () => {
    expect((await A.client.from('rapport').select('id')).data).toEqual([])
    expect((await A.client.from('mon_vote_boss').select('note')).data).toEqual([])
    expect((await appeler(`/api/campagnes/${c.slug}/resultat`, A)).statut).toBe(404)
    expect((await page(`/campagnes/${c.slug}/resultat`, A)).texte).toContain('pas encore publiés')
  })
})

describe('après publication', () => {
  beforeAll(async () => {
    const { error } = await admin.from('campagne').update({ statut: 'publiee' }).eq('id', c.id)
    if (error) throw error
  })

  it('le classement est public : lu par un anonyme, trié, avec notes par critère', async () => {
    const { data } = await anon().from('classement').select('pseudo, rang, score_final, notes').eq('campagne_id', c.id).order('rang')
    expect(data).toHaveLength(2)
    expect(data![0]).toMatchObject({ pseudo: pseudoA, rang: 1 })
    expect(data![0]!.notes).toEqual({ securite: 8, structure: 8, outillage: 8 })
    const api = (await appeler(`/api/campagnes/${c.slug}/classement`)).json as unknown as { pseudo: string }[]
    expect(api.map((l) => l.pseudo)[0]).toBe(pseudoA)
    const { texte } = await page(`/campagnes/${c.slug}`)
    expect(texte).toContain(pseudoA)
    expect(texte).toMatch(/<caption/)
    expect(texte).not.toContain('Le jury délibère')
  })

  it('le rapport est lisible de son seul candidat', async () => {
    const lu = async (u: Utilisateur) => (await u.client.from('rapport').select('jure, resultat')).data ?? []
    expect((await lu(A)).map((r) => r.jure).sort()).toEqual(['lint', 'pitch', 'refacto', 'sudo'])
    expect(JSON.stringify(await lu(B))).not.toContain('REPLIQUE-SUDO-A')
    expect(JSON.stringify(await lu(B))).toContain('REPLIQUE-SUDO-B')
    expect((await lu(autre))).toEqual([])
    const sansSession = await anon().from('rapport').select('id')
    expect(sansSession.error).not.toBeNull()
  })

  it('l\'API de l\'entretien refuse l\'anonyme et celui qui n\'a pas participé', async () => {
    expect((await appeler(`/api/campagnes/${c.slug}/resultat`)).statut).toBe(401)
    expect((await appeler(`/api/campagnes/${c.slug}/resultat`, autre)).statut).toBe(404)
    const anonyme = await page(`/campagnes/${c.slug}/resultat`)
    expect(anonyme.texte).toContain('Connecte-toi')
    expect(anonyme.texte).not.toMatch(/REPLIQUE|Justification|Dites-moi/)
    expect((await page(`/campagnes/${c.slug}/resultat`, autre)).texte).not.toMatch(/REPLIQUE|Justification|Dites-moi/)
  })

  it('l\'entretien de A : répliques, demande, notes et rapport ; la réplique masquée et celles de B n\'y sont pas', async () => {
    const r = await appeler(`/api/campagnes/${c.slug}/resultat`, A)
    expect(r.statut).toBe(200)
    expect(r.texte).not.toContain('REPLIQUE-SUDO-A')
    expect(r.texte).not.toContain('-B')
    const { texte, entetes } = await page(`/campagnes/${c.slug}/resultat`, A)
    expect(entetes.get('cache-control')).toContain('no-store')
    expect(texte).toContain('REPLIQUE-REFACTO-A')
    expect(texte).toContain('REPLIQUE-LINT-A')
    expect(texte).toContain('REPLIQUE-PITCH-A')
    expect(texte).not.toContain('REPLIQUE-SUDO-A')
    expect(texte).not.toMatch(/REPLIQUE-\w+-B/)
    expect(texte).toContain('Dites-moi si mon découpage tient.')
    expect(texte).toContain('Le Boss')
    expect(texte).toContain('src/minuteur.ts:12')
    // Texte de Claude : échappé.
    expect(texte).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(texte).not.toContain('<img src=x')
    // Commentaire du Boss : celui de A seulement, échappé.
    expect(texte).toContain('CMT_BOSS_A &lt;img src=x onerror=alert(1)&gt;')
    expect(texte).not.toContain('CMT_BOSS_B')
  })

  it('le commentaire du Boss est lisible de son seul candidat', async () => {
    const lu = async (u: Utilisateur) => (await u.client.from('mon_vote_boss').select('note, commentaire')).data ?? []
    expect(await lu(A)).toEqual([{ note: 7, commentaire: `CMT_BOSS_A ${HTML}` }])
    expect(JSON.stringify(await lu(B))).not.toContain('CMT_BOSS_A')
    expect(await lu(autre)).toEqual([])
    expect((await anon().from('mon_vote_boss').select('note')).error).not.toBeNull()
    expect((await appeler(`/api/campagnes/${c.slug}/resultat`, B)).texte).not.toContain('CMT_BOSS_A')
  })
})
