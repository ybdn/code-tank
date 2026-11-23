import { describe, expect, it } from 'vitest'
import { adresseJetable } from '../../server/utils/jetable'
import { validerCreation, validerProfil } from '../../shared/utils/compte'

const valide = {
  vrai_nom: 'Ada Lovelace',
  pseudo: 'ada',
  email_contact: 'Ada@Example.org',
  motivation: 'Je code des outils.\nJe candidate pour progresser.',
  depot_cite_url: 'https://github.com/ada/moteur',
  charte: true,
  majeur: true,
}

describe('adresses jetables', () => {
  it('refuse une adresse jetable et ses sous-domaines', () => {
    expect(adresseJetable('x@mailinator.com')).toBe(true)
    expect(adresseJetable('x@sub.mailinator.com')).toBe(true)
  })
  it('accepte une adresse ordinaire', () => {
    expect(adresseJetable('ada@example.org')).toBe(false)
    expect(adresseJetable('ada@gmail.com')).toBe(false)
  })
})

describe('validation du formulaire', () => {
  it('accepte un formulaire valide et normalise l\'adresse', () => {
    const { profil, erreurs } = validerCreation(valide)
    expect(erreurs).toEqual({})
    expect(profil.email_contact).toBe('ada@example.org')
  })
  it('ignore les champs inconnus, github_id compris', () => {
    const { profil } = validerCreation({ ...valide, github_id: '1', etat: 'autorise', role: 'organisateur' })
    expect(Object.keys(profil).sort()).toEqual(['depot_cite_url', 'email_contact', 'motivation', 'pseudo', 'vrai_nom'])
  })
  it.each([
    [{ charte: false }, 'charte'],
    [{ majeur: undefined }, 'majeur'],
    [{ vrai_nom: '  ' }, 'vrai_nom'],
    [{ pseudo: 'a' }, 'pseudo'],
    [{ pseudo: 'Candidat Supprimé' }, 'pseudo'],
    [{ email_contact: 'pas-un-mail' }, 'email_contact'],
    [{ motivation: 'a\nb\nc\nd' }, 'motivation'],
    [{ motivation: 'x'.repeat(1001) }, 'motivation'],
    [{ depot_cite_url: 'http://github.com/a/b' }, 'depot_cite_url'],
    [{ depot_cite_url: 'https://' }, 'depot_cite_url'],
  ])('refuse %j', (modif, champ) => {
    expect(validerCreation({ ...valide, ...modif }).erreurs).toHaveProperty(champ)
  })
  it('une modification partielle ne contrôle que les champs envoyés', () => {
    expect(validerProfil({ motivation: 'ok' })).toEqual({})
    expect(validerProfil({ pseudo: '' })).toHaveProperty('pseudo')
  })
})
