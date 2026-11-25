// Connexion par GitHub : le fournisseur n'ajoute aucun scope (identité et e-mail seulement, aucun accès aux dépôts).
// Retour sur /compte, où la personne crée son compte ou retrouve le sien.
export function useConnexionGithub() {
  const supabase = useSupabaseClient()
  return () => supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: `${window.location.origin}/compte` } })
}
