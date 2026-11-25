import { describe, expect, it } from 'vitest'
import { envoyerCourriel } from '../../server/utils/courriel'

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
