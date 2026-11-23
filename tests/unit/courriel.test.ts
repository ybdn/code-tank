import { describe, expect, it } from 'vitest'
import { envoyerLienVerification } from '../../server/utils/courriel'

const bon = {
  siteUrl: 'https://code-tank.ybdn.io',
  secretVerification: 's'.repeat(32),
  smtp: { host: '127.0.0.1', port: 1, user: '', pass: '' },
}
const id = '6f1e5a0e-7a53-4a40-8f6a-0d8f4a0b1c2d'

// Chaque cas doit échouer avant toute connexion SMTP (le port 1 n'écoute pas : une tentative donnerait une autre erreur).
describe('envoi du lien de vérification : configuration manquante', () => {
  it.each([
    [{ secretVerification: '' }, /NUXT_SECRET_VERIFICATION/],
    [{ secretVerification: 'trop-court' }, /NUXT_SECRET_VERIFICATION/],
    [{ siteUrl: '' }, /NUXT_SITE_URL/],
    [{ siteUrl: '/relatif' }, /NUXT_SITE_URL/],
    [{ smtp: { ...bon.smtp, host: '' } }, /NUXT_SMTP_HOST/],
  ])('%j', async (surcharge, erreur) => {
    await expect(envoyerLienVerification({ ...bon, ...surcharge }, id, 'ada@example.org')).rejects.toThrow(erreur)
  })
  it('refuse une adresse inutilisable', async () => {
    await expect(envoyerLienVerification(bon, id, 'a@example.org,b@example.org')).rejects.toThrow(/inutilisable/)
  })
})
