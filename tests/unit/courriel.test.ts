import { describe, expect, it } from 'vitest'
import { envoyerCourriel, erreurConfigCourriel } from '../../server/utils/courriel'

const bon = { siteUrl: 'https://code-tank.ybdn.io', smtp: { host: '127.0.0.1', port: 1, user: '', pass: '' } }

// Chaque cas doit échouer avant toute connexion SMTP (le port 1 n'écoute pas : une tentative donnerait une autre erreur).
describe('envoi d\'un e-mail : configuration manquante', () => {
  it.each([
    [{ siteUrl: '' }, /NUXT_SITE_URL/],
    [{ siteUrl: '/relatif' }, /NUXT_SITE_URL/],
    [{ smtp: { ...bon.smtp, host: '' } }, /NUXT_SMTP_HOST/],
  ])('%j', async (surcharge, erreur) => {
    await expect(envoyerCourriel({ ...bon, ...surcharge }, 'ada@example.org', 'Sujet', 'Texte')).rejects.toThrow(erreur)
  })
})

// prevenirFin (story 4.7) la vérifie avant reserver_envoi : une configuration manquante ne consomme pas la marque.
describe('configuration d\'envoi', () => {
  it('complète : aucune erreur', () => expect(erreurConfigCourriel(bon)).toBeNull())
  it.each([
    [{ siteUrl: '' }, /NUXT_SITE_URL/],
    [{ siteUrl: 'code-tank.ybdn.io' }, /NUXT_SITE_URL/],
    [{ smtp: { ...bon.smtp, host: '' } }, /NUXT_SMTP_HOST/],
  ])('%j', (surcharge, erreur) => expect(erreurConfigCourriel({ ...bon, ...surcharge })).toMatch(erreur))
})
