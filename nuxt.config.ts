export default defineNuxtConfig({
  compatibilityDate: '2026-11-22',
  modules: ['@nuxt/eslint', 'nuxt-security'],
  css: [
    '@fontsource/space-mono/400.css',
    '@fontsource/space-mono/700.css',
    '@fontsource-variable/plus-jakarta-sans/index.css',
    '~/assets/css/main.css',
  ],
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      titleTemplate: '%s · Code Tank',
      meta: [{ name: 'theme-color', content: '#18191b' }],
      link: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    },
  },
  // Les polices restent des fichiers : un data: URI serait refusé par font-src 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
  security: {
    nonce: true,
    // Pas d'API ouverte à d'autres origines pour l'instant.
    corsHandler: false,
    // Pas de formulaire dans ce lot : la limite de débit viendra avec la création de compte.
    rateLimiter: false,
    headers: {
      contentSecurityPolicy: {
        'default-src': ["'none'"],
        'script-src': ["'self'", "'strict-dynamic'", "'nonce-{{nonce}}'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
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
