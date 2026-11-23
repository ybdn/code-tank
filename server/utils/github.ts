// Données publiques de GitHub, lues sans jeton, pour aider l'organisateur à autoriser un compte.
// Un échec ne bloque jamais la création du compte : on renvoie null.
export async function lireGithub(base: string, githubId: string) {
  const lire = async (chemin: string) => {
    const r = await fetch(`${base}${chemin}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'code-tank' },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) throw new Error(`GitHub ${r.status}`)
    return r.json()
  }
  try {
    const profil = await lire(`/user/${encodeURIComponent(githubId)}`)
    const evenements = await lire(`/users/${encodeURIComponent(profil.login)}/events/public?per_page=30`)
    return {
      login: String(profil.login),
      compte_cree_le: String(profil.created_at),
      depots_publics: Number(profil.public_repos),
      derniere_activite: evenements[0]?.created_at ?? null,
      evenements_recents: Array.isArray(evenements) ? evenements.length : 0,
      lu_le: new Date().toISOString(),
    }
  } catch (e) {
    console.warn('Lecture GitHub impossible :', e instanceof Error ? e.message : e)
    return null
  }
}
