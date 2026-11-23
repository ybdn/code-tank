import { describe, expect, it } from 'vitest'
import { listerOutils, TAILLE_MAX_ZIP, validerDeclaration, validerFichier } from '../../shared/utils/depot'

const valide = {
  presentation: 'Un moteur de règles.',
  demande: '',
  type_code: 'open_source',
  declaration_code: true,
  aucun_outil: false,
  outils_ia: ['Claude Code'],
  contact_reutilisation: false,
}

describe('déclaration de dépôt', () => {
  it('accepte une déclaration complète et nettoie les champs', () => {
    const { declaration, erreurs } = validerDeclaration({ ...valide, presentation: '  Un moteur.  ', demande: ' Je vise 8/10 ', contact_reutilisation: true })
    expect(erreurs).toEqual({})
    expect(declaration).toEqual({ presentation: 'Un moteur.', demande: 'Je vise 8/10', type_code: 'open_source', outils_ia: ['Claude Code'], contact_reutilisation: true })
  })

  it('refuse une présentation vide ou de plus de 500 caractères, une demande de plus de 80', () => {
    expect(validerDeclaration({ ...valide, presentation: '   ' }).erreurs).toHaveProperty('presentation')
    expect(validerDeclaration({ ...valide, presentation: 'a'.repeat(501) }).erreurs).toHaveProperty('presentation')
    expect(validerDeclaration({ ...valide, presentation: 'a'.repeat(500), demande: 'b'.repeat(80) }).erreurs).toEqual({})
    expect(validerDeclaration({ ...valide, demande: 'b'.repeat(81) }).erreurs).toHaveProperty('demande')
  })

  it('exige la case de licence, vraie et seule (« true » en texte ne suffit pas)', () => {
    expect(validerDeclaration({ ...valide, declaration_code: false }).erreurs).toHaveProperty('declaration_code')
    expect(validerDeclaration({ ...valide, declaration_code: 'true' }).erreurs).toHaveProperty('declaration_code')
    const { declaration_code: _, ...sans } = valide
    expect(validerDeclaration(sans).erreurs).toHaveProperty('declaration_code')
  })

  it('exige un type de code connu', () => {
    expect(validerDeclaration({ ...valide, type_code: 'autre' }).erreurs).toHaveProperty('type_code')
    expect(validerDeclaration({ ...valide, type_code: 'proprietaire' }).erreurs).toEqual({})
  })

  it('outils d\'IA : une liste ou « aucun », jamais rien ni les deux', () => {
    expect(validerDeclaration({ ...valide, outils_ia: [] }).erreurs).toHaveProperty('outils_ia')
    expect(validerDeclaration({ ...valide, outils_ia: [], aucun_outil: true }).erreurs).toEqual({})
    expect(validerDeclaration({ ...valide, aucun_outil: true }).erreurs).toHaveProperty('outils_ia')
    expect(validerDeclaration({ ...valide, outils_ia: 'Claude' }).erreurs).toHaveProperty('outils_ia')
    expect(validerDeclaration({ ...valide, outils_ia: Array(11).fill('x') }).erreurs).toHaveProperty('outils_ia')
    expect(validerDeclaration({ ...valide, outils_ia: ['x'.repeat(51)] }).erreurs).toHaveProperty('outils_ia')
  })

  it('listerOutils découpe sur virgules et lignes', () => {
    expect(listerOutils('Claude Code, Copilot\n Cursor ,,')).toEqual(['Claude Code', 'Copilot', 'Cursor'])
  })
})

describe('fichier', () => {
  it('accepte un zip de 20 Mo au plus, refuse le reste', () => {
    expect(validerFichier({ name: 'projet.ZIP', size: TAILLE_MAX_ZIP })).toBeUndefined()
    expect(validerFichier({ name: 'projet.zip', size: TAILLE_MAX_ZIP + 1 })).toBeTruthy()
    expect(validerFichier({ name: 'projet.tar.gz', size: 10 })).toBeTruthy()
    expect(validerFichier({ name: 'projet.zip', size: 0 })).toBeTruthy()
    expect(validerFichier(null)).toBeTruthy()
  })
})
