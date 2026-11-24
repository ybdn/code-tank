// L'URL de Supabase entre dans la CSP au build : elle doit être définie à ce moment-là.
// Même ordre que @nuxtjs/supabase (NUXT_* avant SUPABASE_* de l'intégration Vercel) : la CSP et le client lisent la même URL.
const urlSupabase = process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL

export default defineNuxtConfig({
  compatibilityDate: '2026-11-22',
  modules: ['@nuxt/eslint', 'nuxt-security', '@nuxtjs/supabase'],
  supabase: {
    // Seule /compte demande une session, et elle gère elle-même l'état déconnecté : aucune redirection globale.
    redirect: false,
    // Nom stable du cookie de session, indépendant de l'URL de Supabase.
    cookiePrefix: 'sb-code-tank',
  },
  runtimeConfig: {
    // Valeurs fournies par l'environnement (NUXT_*) ; voir le README.
    secretVerification: '',
    secretDebit: '',
    versionCharte: '',
    siteUrl: '',
    githubApi: 'https://api.github.com',
    // Jury (dépôt privé) : URL complète de POST /api/jury et secret partagé ; sans eux, le site n'appelle rien.
    juryUrl: '',
    jurySecret: '',
    smtp: { host: '', port: 587, user: '', pass: '' },
  },
  css: [
    '@fontsource/space-mono/400.css',
    '@fontsource/space-mono/700.css',
    '@fontsource-variable/plus-jakarta-sans/index.css',
    '~/assets/css/main.css',
  ],
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      titleTemplate: '%s · Code Tank by ybdn.io',
      meta: [{ name: 'theme-color', content: '#18191b' }],
      link: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    },
  },
  // Entretien et rapport d'un candidat : jamais mis en cache, ni par le navigateur ni par un relais.
  routeRules: { '/campagnes/*/resultat': { headers: { 'cache-control': 'private, no-store' } } },
  // Les polices restent des fichiers : un data: URI serait refusé par font-src 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
  security: {
    nonce: true,
    // Pas d'API ouverte à d'autres origines pour l'instant.
    corsHandler: false,
    // Pas celle du module : la limite de débit est la nôtre (table debit, server/utils/debit.ts).
    rateLimiter: false,
    // Le filtre XSS rejetait en 400 tout corps citant une balise, cas normal chez des développeurs : le texte saisi est rendu comme
    // du texte par Vue, la CSP interdit les scripts en ligne et aucun v-html ne reçoit de texte saisi.
    xssValidator: false,
    headers: {
      contentSecurityPolicy: {
        'default-src': ["'none'"],
        'script-src': ["'self'", "'strict-dynamic'", "'nonce-{{nonce}}'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'", ...(urlSupabase ? [new URL(urlSupabase).origin] : [])],
        'manifest-src': ["'self'"],
        'base-uri': ["'none'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'script-src-attr': ["'none'"],
        'upgrade-insecure-requests': true,
      },
    },
  },
})
