import type { H3Event } from 'h3'

// Test d'une clé API du Boss (story 4.3, AD-4) : préfixe, jeton d'abonnement refusé, puis count_tokens sur un texte fixe, sans
// aucun code. Aucune dépendance Anthropic. La clé ne sort de ce fichier que dans l'en-tête de l'appel ; la réponse n'est jamais
// lue ni journalisée : seul le statut HTTP l'est, jamais la clé ni une erreur du client.
const DELAI_ANTHROPIC_MS = 10_000
// Même modèle que MODELE de prive (AD-8).
const MODELE = 'claude-opus-5-5'
export const MESSAGE_CLE_REFUSEE = 'Cette clé est refusée : colle une clé API de la Console Anthropic (elle commence par sk-ant-), pas un jeton d\'abonnement.'

// Une clé de la Console : sk-ant-, jamais sk-ant-oat (jeton OAuth d'abonnement), longueur et caractères bornés.
export const formeCleValide = (cle: unknown): cle is string =>
  typeof cle === 'string' && /^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(cle) && !cle.startsWith('sk-ant-oat')

// Seule destination autorisée pour la clé : l'API d'Anthropic, ou la machine locale (faux serveur des tests de pile). Toute autre
// valeur de NUXT_ANTHROPIC_URL, mal réglée ou malveillante, enverrait la clé ailleurs : 502 sans appel.
export function urlAnthropicAutorisee(valeur: string) {
  try {
    const u = new URL(valeur)
    return u.origin === 'https://api.anthropic.com' || (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost'))
  } catch {
    return false
  }
}

export type VerdictCle = 'valide' | 'refusee' | 'indisponible'

export async function verifierCle(event: H3Event, cle: string): Promise<VerdictCle> {
  const { anthropicUrl } = useRuntimeConfig(event)
  if (!urlAnthropicAutorisee(anthropicUrl)) {
    console.error('Test de la clé du Boss : URL d\'Anthropic non autorisée, aucun appel.')
    return 'indisponible'
  }
  let code = 0
  try {
    const r = await fetch(anthropicUrl, {
      method: 'POST',
      headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELE, messages: [{ role: 'user', content: 'Bonjour.' }] }),
      // Jamais de redirection : elle renverrait x-api-key vers une autre origine.
      redirect: 'error',
      signal: AbortSignal.timeout(DELAI_ANTHROPIC_MS),
    })
    code = r.status
    await r.body?.cancel()
  } catch {
    // injoignable ou trop lent : code 0, l'erreur n'est pas journalisée (elle pourrait citer l'appel)
  }
  if (code === 200) return 'valide'
  console.error(`Test de la clé du Boss (count_tokens) : code ${code}.`)
  // shortcut: un 404 (modèle retiré ou renommé) donne un 502 « réessaie » permanent ; le statut est journalisé ci-dessus. À revoir
  // au changement de MODELE (AD-8).
  return code === 401 || code === 403 ? 'refusee' : 'indisponible'
}
