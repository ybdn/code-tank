import { describe, expect, it } from 'vitest'
import { TAILLE_MAX_ZIP, validerFichier } from '../../shared/utils/depot'

describe('validerFichier', () => {
  it('accepte un zip de 1 octet à 20 Mo, extension en toute casse', () => {
    expect(validerFichier({ name: 'projet.zip', size: 1 })).toBe('')
    expect(validerFichier({ name: 'PROJET.ZIP', size: TAILLE_MAX_ZIP })).toBe('')
  })
  it('refuse l\'absence de fichier, un autre format, un fichier vide ou trop gros', () => {
    expect(validerFichier(null)).toBe('Choisis l\'archive .zip de ton projet.')
    expect(validerFichier({ name: 'projet.tar.gz', size: 10 })).toBe('Le fichier doit être une archive .zip.')
    expect(validerFichier({ name: 'projet.zip', size: 0 })).toBe('Ce fichier est vide.')
    expect(validerFichier({ name: 'projet.zip', size: TAILLE_MAX_ZIP + 1 })).toBe('L\'archive fait plus de 20 Mo.')
  })
})
