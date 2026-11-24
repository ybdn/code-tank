import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

// Pages de résultats rendues côté serveur, sans pile Supabase : un faux PostgREST répond aux seules lectures publiques
// (campagne, classement) avec des données choisies par le test, et note chaque requête reçue.
const racine = fileURLToPath(new URL('..', import.meta.url))
const requetes: string[] = []
const base = { id: 'c1', theme: 'Un minuteur', brief: 'Brief.', ouverture_inscriptions: '2026-12-01T00:00:00Z', cloture_depot: '2026-12-15T00:00:00Z', date_resultats: '2026-12-31T00:00:00Z', max_participants: 10 }
const criteres = [{ cle: 'tests', libelle: 'Tests', poids: 60, jure: 'lint' }, { cle: 'brief', libelle: 'Réponse au brief', poids: 40, jure: 'pitch' }]
const campagnes: Record<string, object> = {
  ouverte: { ...base, slug: 'ouverte', titre: 'Campagne ouverte', statut: 'inscriptions', criteres },
  attente: { ...base, slug: 'attente', titre: 'Campagne en délibération', statut: 'deliberation', criteres },
  prete: { ...base, slug: 'prete', titre: 'Campagne prête', statut: 'prete', criteres },
  finale: { ...base, slug: 'finale', titre: 'Campagne publiée <script>alert(1)</script>', statut: 'publiee', criteres },
  duo: { ...base, id: 'c2', slug: 'duo', titre: 'Deux candidats', statut: 'publiee', criteres },
}
const ligne = (pseudo: string, rang: number | null, extra = {}) => ({
  pseudo, rang, score_claude: 71.5, note_boss: 7, score_final: 70, notes: { tests: 7, brief: 6 }, disqualifie: false, justification: null, justification_departage: null, ...extra,
})
const classements: Record<string, object[]> = {
  c1: [
    ligne('<img src=x onerror=alert(1)>', 1), ligne('bob', 2), ligne('chloé', 3, { justification_departage: '<b>Départage</b> décidé' }), ligne('dan', 4),
    ligne('eve', null, { disqualifie: true, justification: '<script>alert(2)</script> triche', score_final: null }),
  ],
  c2: [ligne('ada', 1, { notes: { tests: 8.5, brief: null } }), ligne('bob', 2)],
}

const faux = createServer((req, res) => {
  const url = new URL(req.url ?? '', 'http://x')
  requetes.push(url.pathname.replace('/rest/v1/', '') + url.search)
  res.setHeader('content-type', 'application/json')
  if (url.pathname.endsWith('/campagne')) {
    const c = campagnes[(url.searchParams.get('slug') ?? '').replace('eq.', '')]
    return res.end(JSON.stringify(c ? [c] : []))
  }
  if (url.pathname.endsWith('/classement')) return res.end(JSON.stringify(classements[(url.searchParams.get('campagne_id') ?? '').replace('eq.', '')] ?? []))
  res.statusCode = 404
  res.end('[]')
})
await new Promise<void>((ok) => faux.listen(0, '127.0.0.1', ok))
process.env.NUXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${(faux.address() as AddressInfo).port}`
process.env.NUXT_PUBLIC_SUPABASE_KEY = 'cle-publique-factice'
await setup({ rootDir: racine, server: true })
afterAll(() => faux.close())

describe.each(['attente', 'prete'])('campagne en délibération (%s)', (slug) => {
  it('affiche l\'écran d\'attente, sans note ni classement, et ne lit aucun résultat', async () => {
    requetes.length = 0
    const html = await $fetch<string>(`/campagnes/${slug}`)
    expect(html).toContain('Le jury délibère')
    expect(html).toContain('class="plateau"')
    expect(html).not.toMatch(/<table|podium|sur 10\b|sur 100\b|score|candidat/i)
    expect(requetes.some((r) => /classement|rapport|audit|vote/.test(r))).toBe(false)
  })
})

describe('classement public', () => {
  it('rend les textes des candidats comme du texte', async () => {
    const html = await $fetch<string>('/campagnes/finale')
    expect(html).not.toMatch(/<img src=x|<script>alert|<b>Départage/)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt; triche')
    expect(html).toContain('&lt;b&gt;Départage&lt;/b&gt; décidé')
  })

  it('montre le podium à partir de trois classés, avec un tableau accessible', async () => {
    const html = await $fetch<string>('/campagnes/finale')
    expect(html).toContain('Le podium')
    expect(html).toMatch(/<caption[^>]*>Classement final de /)
    expect(html).toContain('scope="col"')
    expect(html).toContain('scope="row"')
    expect(html).toContain('Disqualifié')
    expect(html).toContain('Réponse au brief (40 %)')
  })

  it('écrit les notes par critère à la française, et « — » pour une note absente', async () => {
    const html = await $fetch<string>('/campagnes/duo')
    expect(html).toContain('<td>8,5</td>')
    expect(html).not.toContain('<td>8.5</td>')
    expect(html).toContain('<td>—</td>')
  })

  it('n\'a pas de podium avec deux classés', async () => {
    const html = await $fetch<string>('/campagnes/duo')
    expect(html).not.toContain('Le podium')
    expect(html).toContain('Le classement final')
  })
})

describe('entretien et rapport', () => {
  it('l\'API refuse un visiteur sans session', async () => {
    expect((await fetch('/api/campagnes/finale/resultat')).status).toBe(401)
  })

  it('la page invite à se connecter et ne montre aucun résultat', async () => {
    const html = await $fetch<string>('/campagnes/finale/resultat')
    expect(html).toContain('Connecte-toi')
    expect(html).not.toMatch(/Ton rapport|sur 10\b|replique/)
  })

  it('avant publication, la page n\'ouvre rien', async () => {
    expect(await $fetch<string>('/campagnes/attente/resultat')).toContain('pas encore publiés')
  })
})

// Typographie : l'espace avant « : ; ? ! » » et après « « » est insécable (U+00A0), écrite à la source.
// Une espace ordinaire laisse le navigateur couper la ligne juste avant la ponctuation.
const DEFAUT = / [:;?!»]|« /
const extraits = (texte: string) => [...texte.matchAll(new RegExp(DEFAUT, 'g'))].map((m) => texte.slice(Math.max(0, m.index - 30), m.index + 10))

describe('espace insécable dans les textes', () => {
  // Chaque page porte un texte témoin : une page d'erreur passerait le contrôle sans rien prouver.
  it.each([
    ['/', 'Le Boss'], ['/campagnes/ouverte', 'Thème imposé'], ['/campagnes/attente', 'Le jury délibère'], ['/campagnes/finale', 'Le podium'],
    ['/campagnes/finale/resultat', 'Connecte-toi'], ['/charte', 'Charte'], ['/confidentialite', 'Politique de confidentialité'], ['/mentions-legales', 'Mentions légales'],
  ])('%s', async (page, temoin) => {
    const html = await $fetch<string>(page)
    expect(html).toContain(temoin)
    const attributs = [...html.matchAll(/\s(?:aria-label|title|placeholder|alt|content)="([^"]*)"/g)].map((m) => m[1])
    const texte = [html.replace(/<(script|style|code|pre)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '), ...attributs].join('\n')
      .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    expect(extraits(texte)).toEqual([])
  })

  it.each(['charte', 'mentions-legales', 'politique-de-confidentialite'])('content/%s.md', async (nom) => {
    const { readFile } = await import('node:fs/promises')
    const md = (await readFile(`${racine}content/${nom}.md`, 'utf8')).replace(/`[^`]*`/g, ' ')
    expect(extraits(md)).toEqual([])
  })
})
