// Lecture d'administration faite par le serveur pendant le rendu. Une réponse 404 de l'API donne la même page 404 qu'une
// adresse inconnue : rien ne révèle l'administration à un non-organisateur qui y arriverait par la navigation du navigateur.
export async function useLectureAdmin<T>(url: string) {
  const { data, error, refresh } = await useFetch<T>(url, { retry: 0, key: url })
  if (!data.value) {
    const introuvable = error.value?.statusCode === 404
    throw createError({ statusCode: introuvable ? 404 : 503, statusMessage: introuvable ? 'Page introuvable' : 'Lecture impossible pour le moment', fatal: true })
  }
  return { data: data as Ref<T>, refresh }
}

type ReponseErreur = { data?: { statusMessage?: string; data?: { erreurs?: Record<string, string> } } }

// Une action de l'organisateur : occupée, message de réussite, erreur générale annoncée ou erreurs par champ.
export function useAction() {
  const occupe = ref(false)
  const message = ref('')
  const alerte = ref('')
  const erreurs = ref<Record<string, string>>({})
  async function lancer<T>(requete: () => Promise<T>, ok: string): Promise<T | null> {
    occupe.value = true
    message.value = alerte.value = ''
    erreurs.value = {}
    try {
      const r = await requete()
      message.value = ok
      return r
    } catch (e) {
      const err = e as ReponseErreur
      erreurs.value = err.data?.data?.erreurs ?? {}
      if (!Object.keys(erreurs.value).length) alerte.value = err.data?.statusMessage ?? 'Une erreur est survenue.'
      return null
    } finally {
      occupe.value = false
    }
  }
  return { occupe, message, alerte, erreurs, lancer }
}

// Le lien « Administration » n'existe que pour l'organisateur ; la vraie barrière reste le serveur.
export function useOrganisateur() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const organisateur = ref(false)
  async function charger() {
    organisateur.value = user.value ? (await supabase.rpc('est_organisateur')).data === true : false
  }
  onMounted(charger)
  watch(user, charger)
  return organisateur
}
