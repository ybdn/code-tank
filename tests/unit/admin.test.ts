import { describe, expect, it } from 'vitest'
import {
  CRITERES_PAR_DEFAUT, MODELES_PAR_DEFAUT, cheminAdmin, contradictionsIa, libelleElement, depuisChampLocal, etapeSuivante, libellerStatuts, prochaineEcheance, tachesAdmin, validerCampagne, validerReglages, versChampLocal,
  type CampagneTableau, type TableauDeBord,
} from '../../shared/utils/admin'

const valide = () => ({
  slug: 'minuteur-de-pause', titre: 'Minuteur', theme: 'Un minuteur', brief: 'Écris un minuteur.', criteres: structuredClone(CRITERES_PAR_DEFAUT),
  ouverture_inscriptions: '2026-12-01T09:00:00.000Z', cloture_depot: '2026-12-15T09:00:00.000Z', date_resultats: '2026-12-31T09:00:00.000Z', max_participants: 10,
})

describe('cheminAdmin : tout ce qui mène à l\'administration est contrôlé', () => {
  it.each(['/admin', '/admin/', '/admin/comptes', '/Admin', '/ADMIN/x', '/%61dmin', '//admin', '/api/admin/comptes', '/api//admin', '/API/Admin/x', '/admin?x=1', '/admin%zz'])('%s', (c) => {
    expect(cheminAdmin(c)).toBe(true)
  })
  it.each(['/', '/administrateur', '/compte', '/campagnes/admin', '/api/campagnes', '/api/compte/admin'])('%s n\'en fait pas partie', (c) => {
    expect(cheminAdmin(c)).toBe(false)
  })
})

describe('dates à l\'heure de Paris', () => {
  it('aller-retour, heure d\'hiver et heure d\'été', () => {
    expect(depuisChampLocal('2026-12-01T09:30')).toBe('2026-12-01T08:30:00.000Z')
    expect(depuisChampLocal('2026-07-01T09:30')).toBe('2026-07-01T07:30:00.000Z')
    expect(versChampLocal('2026-12-01T08:30:00.000Z')).toBe('2026-12-01T09:30')
    expect(versChampLocal('2026-07-01T07:30:00.000Z')).toBe('2026-07-01T09:30')
  })
  it('autour du changement d\'heure (29 mars 2026, 02:00 → 03:00)', () => {
    expect(depuisChampLocal('2026-03-29T01:59')).toBe('2026-03-29T00:59:00.000Z')
    expect(depuisChampLocal('2026-03-29T03:00')).toBe('2026-03-29T01:00:00.000Z')
  })
  it('une saisie vide ou invalide donne une chaîne vide', () => {
    expect(depuisChampLocal('')).toBe('')
  })
})

describe('validerCampagne', () => {
  it('accepte une campagne valide et normalise les critères', () => {
    const { campagne, erreurs } = validerCampagne(valide())
    expect(erreurs).toEqual({})
    expect(campagne.criteres).toHaveLength(8)
    expect(campagne.criteres.find((c) => c.cle === 'outillage')?.calcule).toBe(true)
    expect(campagne.criteres.reduce((s, c) => s + c.poids, 0)).toBe(100)
  })
  it('les modèles sont facultatifs et gardés tels quels : un par juré', () => {
    expect(validerCampagne(valide()).campagne).not.toHaveProperty('modeles')
    const modeles = { sudo: 'claude-opus-5-5', refacto: 'claude-sonnet-5-5', lint: 'claude-haiku-5-5', pitch: 'claude-sonnet-5-5' }
    const r = validerCampagne({ ...valide(), modeles })
    expect(r.erreurs).toEqual({})
    expect(r.campagne.modeles).toEqual(modeles)
  })
  it('ne contrôle pas le total des poids : la base le fait à l\'ouverture', () => {
    const c = valide()
    c.criteres[0]!.poids = 5
    expect(validerCampagne(c).erreurs).toEqual({})
  })
  it.each([
    ['slug majuscules', { slug: 'Minuteur' }, 'slug'],
    ['slug vide', { slug: '' }, 'slug'],
    ['titre vide', { titre: '  ' }, 'titre'],
    ['brief trop long', { brief: 'x'.repeat(5001) }, 'brief'],
    ['date illisible', { cloture_depot: 'demain' }, 'cloture_depot'],
    ['clôture avant l\'ouverture', { cloture_depot: '2026-11-01T00:00:00.000Z' }, 'cloture_depot'],
    ['résultats avant la clôture', { date_resultats: '2026-12-10T00:00:00.000Z' }, 'date_resultats'],
    ['participants nul', { max_participants: 0 }, 'max_participants'],
    ['participants décimal', { max_participants: 2.5 }, 'max_participants'],
    ['participants en texte', { max_participants: '10' }, 'max_participants'],
    ['aucun critère', { criteres: [] }, 'criteres'],
    ['poids décimal', { criteres: [{ cle: 'a', libelle: 'A', poids: 10.5, jure: 'sudo' }] }, 'criteres'],
    ['poids négatif', { criteres: [{ cle: 'a', libelle: 'A', poids: -1, jure: 'sudo' }] }, 'criteres'],
    ['juré inconnu', { criteres: [{ cle: 'a', libelle: 'A', poids: 100, jure: 'boss' }] }, 'criteres'],
    ['clé en double', { criteres: [{ cle: 'a', libelle: 'A', poids: 50, jure: 'sudo' }, { cle: 'a', libelle: 'B', poids: 50, jure: 'lint' }] }, 'criteres'],
    ['libellé vide', { criteres: [{ cle: 'a', libelle: ' ', poids: 100, jure: 'sudo' }] }, 'criteres'],
    ['modèle inconnu', { modeles: { ...MODELES_PAR_DEFAUT, sudo: 'claude-opus-4-8' } }, 'modeles'],
    ['juré manquant', { modeles: { sudo: 'claude-opus-5-5', refacto: 'claude-opus-5-5', lint: 'claude-opus-5-5' } }, 'modeles'],
    ['clé de juré en trop', { modeles: { ...MODELES_PAR_DEFAUT, boss: 'claude-opus-5-5' } }, 'modeles'],
    ['modèles en texte', { modeles: 'claude-opus-5-5' }, 'modeles'],
  ])('refuse : %s', (_nom, surcharge, champ) => {
    expect(validerCampagne({ ...valide(), ...surcharge }).erreurs).toHaveProperty(champ)
  })
})

describe('validerReglages', () => {
  it('plafond vide = aucun plafond', () => {
    expect(validerReglages({ plafond_comptes: '', plafond_depense_usd: 50 })).toEqual({ reglages: { plafond_comptes: null, plafond_depense_usd: 50 }, erreurs: {} })
    expect(validerReglages({ plafond_comptes: 0, plafond_depense_usd: 12.5 }).erreurs).toEqual({})
  })
  it.each([[-1, 50], [1.5, 50], ['a', 50], [10, 0], [10, -3], [10, 1.234], [10, '50'], [10, 1e8]])('refuse %s / %s', (plafond, depense) => {
    expect(Object.keys(validerReglages({ plafond_comptes: plafond, plafond_depense_usd: depense }).erreurs)).not.toHaveLength(0)
  })
})

const trace = (surcharge: Record<string, unknown> = {}) => ({ outil: 'claude', type: 'dossier', fichier: '.claude/settings.json', occurrences: 2, declaree: true, ...surcharge })

describe('contradictionsIa : seul `declaree: false` du contrôle des zips compte', () => {
  it('rien à signaler sans trace, ou quand toutes sont couvertes (alias gérés par le contrôle)', () => {
    expect(contradictionsIa([])).toEqual([])
    expect(contradictionsIa(undefined)).toEqual([])
    expect(contradictionsIa([
      trace({ outil: 'claude', declaree: true }), // couverte par « Anthropic » déclaré
      trace({ outil: 'windsurf', fichier: '.windsurfrules', declaree: true }), // couverte par « Codeium »
      trace({ outil: 'agents', type: 'fichier', fichier: 'AGENTS.md', occurrences: 1, declaree: true }), // trace générique
    ])).toEqual([])
  })
  it('une trace non couverte est une contradiction, avec son lieu', () => {
    expect(contradictionsIa([trace({ declaree: true }), trace({ outil: 'cursor', fichier: '.cursor/rules', ligne: 4, occurrences: 1, declaree: false })]))
      .toEqual(['Trace non couverte par la déclaration\u00a0: cursor · dossier\u00a0: .cursor/rules:4, 1 occurrence.'])
  })
})

describe('libelleElement : jamais « [object Object] »', () => {
  it('alerte d\'intégrité, trace, texte', () => {
    expect(libelleElement({ type: 'postinstall', fichier: 'package.json', ligne: 12 })).toBe('postinstall\u00a0: package.json:12')
    expect(libelleElement({ type: 'eval', fichier: 'a.js' })).toBe('eval\u00a0: a.js')
    expect(libelleElement(trace())).toBe('claude · dossier\u00a0: .claude/settings.json, 2 occurrences')
    expect(libelleElement('texte')).toBe('texte')
    expect(libelleElement({ inconnu: 1 })).toBe('{"inconnu":1}')
  })
})

describe('étapes', () => {
  it('la suite suit l\'ordre du cycle', () => {
    expect(etapeSuivante('brouillon')).toBe('inscriptions')
    expect(etapeSuivante('prete')).toBe('publiee')
    expect(etapeSuivante('archivee')).toBeNull()
  })
  it('le refus de transition de la base nomme les statuts par leur libellé', () => {
    expect(libellerStatuts('Transition de statut interdite : de depot à inscriptions.'))
      .toBe('Transition de statut interdite\u00a0: de «\u00a0Dépôt ouvert\u00a0» à «\u00a0Inscriptions ouvertes\u00a0».')
    expect(libellerStatuts('Le vote est verrouillé : il ne se modifie plus.')).toBe('Le vote est verrouillé : il ne se modifie plus.')
  })
})

describe('tachesAdmin : ce qui attend l\'organisateur', () => {
  const MAINTENANT = Date.parse('2026-12-10T12:00:00.000Z')
  const campagne = (c: Partial<CampagneTableau>): CampagneTableau => ({
    id: 'c', slug: 'minuteur', titre: 'Minuteur', statut: 'depot', ouverture_inscriptions: '2026-12-01T09:00:00.000Z', cloture_depot: '2026-12-15T09:00:00.000Z',
    date_resultats: '2026-12-31T09:00:00.000Z', max_participants: 10, inscrits: 0, receptions_en_attente: 0, receptions_refusees: 0, depots: 0, votes_verrouilles: 0, ...c,
  })
  const tableau = (campagnes: CampagneTableau[], comptes: Record<string, number> = {}, brouillons: TableauDeBord['brouillons'] = []): TableauDeBord => ({ comptes, plafond_comptes: null, plafond_depense_usd: 50, campagnes, brouillons })

  it('rien à faire : liste vide', () => {
    expect(tachesAdmin(tableau([campagne({})]), MAINTENANT)).toEqual([])
  })
  it('comptes à décider (urgent) et liste d\'attente, avec le lien du bon panneau', () => {
    const t = tachesAdmin(tableau([], { verifie: 2, liste_attente: 1, autorise: 5 }), MAINTENANT)
    expect(t.map((x) => [x.urgent, x.lien])).toEqual([[true, '/admin/comptes?panneau=verifie'], [false, '/admin/comptes?panneau=liste_attente']])
    expect(t[0]!.texte).toBe('2 comptes vérifiés attendent ta décision.')
  })
  it('dates dépassées : brouillon à ouvrir, dépôt clos, résultats à publier', () => {
    const t = tachesAdmin(tableau([
      campagne({ slug: 'b', statut: 'inscriptions', cloture_depot: '2026-12-10T12:00:00.000Z' }),
      campagne({ slug: 'c', statut: 'prete', date_resultats: '2026-12-01T00:00:00.000Z', depots: 2, votes_verrouilles: 2 }),
    ], {}, [
      { slug: 'a', titre: 'Minuteur', ouverture_inscriptions: '2026-12-09T09:00:00.000Z' },
      { slug: 'z', titre: 'Plus tard', ouverture_inscriptions: '2026-12-20T09:00:00.000Z' },
    ]), MAINTENANT)
    expect(t.map((x) => x.lien)).toEqual(['/admin/campagnes/a?panneau=etape', '/admin/campagnes/b?panneau=etape', '/admin/campagnes/c?panneau=etape'])
    expect(t.every((x) => x.urgent)).toBe(true)
  })
  it('délibération : votes à verrouiller, puis invitation à la relecture ; les urgences passent devant', () => {
    const t = tachesAdmin(tableau([
      campagne({ slug: 'a', statut: 'deliberation', depots: 3, votes_verrouilles: 3 }),
      campagne({ slug: 'b', statut: 'deliberation', depots: 3, votes_verrouilles: 1, receptions_en_attente: 1 }),
    ]), MAINTENANT)
    expect(t.map((x) => [x.urgent, x.texte])).toEqual([
      [true, 'Minuteur\u00a0: 2 votes du Boss restent à verrouiller.'],
      [false, 'Minuteur\u00a0: tous les votes sont verrouillés, tu peux passer à la relecture.'],
      [false, 'Minuteur\u00a0: 1 envoi attend le contrôle du dépôt.'],
    ])
  })
  it('prochaine échéance selon l\'étape', () => {
    expect(prochaineEcheance(campagne({ statut: 'brouillon' }))?.libelle).toBe('Ouverture des inscriptions')
    expect(prochaineEcheance(campagne({ statut: 'depot' }))?.libelle).toBe('Clôture du dépôt')
    expect(prochaineEcheance(campagne({ statut: 'prete' }))?.libelle).toBe('Résultats')
    expect(prochaineEcheance(campagne({ statut: 'publiee' }))).toBeNull()
  })
})
