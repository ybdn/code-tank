<script setup lang="ts">
useHead({ title: 'Mon compte' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const connecterGithub = useConnexionGithub()

type Etat = 'actif' | 'suspendu'
const ETATS: Record<Etat, string> = {
  actif: 'Compte actif.',
  suspendu: 'Ton compte est suspendu.',
}
const VERSION = new Date(VERSION_CHARTE).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

// Le serveur ne voit pas toujours la session au rendu : tout se lit après le montage.
const pret = ref(false)
const compte = ref<{ pseudo: string; etat: string } | null>(null)
const f = reactive({ pseudo: '', charte: false, majeur: false })
const erreurs = ref<Partial<Record<'pseudo' | 'charte' | 'majeur', string>>>({})
const occupe = ref(false)
const alerte = ref('')
const formulaire = useTemplateRef<HTMLFormElement>('formulaire')
const titreEtat = useTemplateRef<HTMLElement>('titreEtat')
// Pendant la lecture, ni formulaire ni compte : au retour de GitHub, un compte existant ne voit pas le formulaire.
const chargement = ref(false)

async function charger() {
  chargement.value = true
  // La RLS ne laisse lire que sa propre ligne.
  const { data, error } = await supabase.from('compte').select('pseudo, etat').maybeSingle()
  if (error) alerte.value = 'Impossible de lire ton compte pour le moment.'
  compte.value = data
  chargement.value = false
}

onMounted(async () => {
  // Retour d'un échec de connexion GitHub : message fixe, jamais error_description (texte venu de l'URL).
  if (route.query.error || window.location.hash.includes('error=')) alerte.value = 'La connexion GitHub n\'a pas abouti. Réessaie.'
  if (user.value) await charger()
  pret.value = true
})
watch(user, async (u) => {
  if (!pret.value) return
  if (u) await charger()
  else compte.value = null
})

async function connecter() {
  const { error } = await connecterGithub()
  if (error) alerte.value = 'La connexion avec GitHub a échoué. Réessaie dans un instant.'
}

async function deconnecter() {
  await supabase.auth.signOut()
  compte.value = null
}

async function creer() {
  alerte.value = ''
  erreurs.value = {}
  if (!PSEUDO.test(f.pseudo.trim())) erreurs.value.pseudo = 'Le pseudo fait 3 à 39 caractères : lettres sans accent, chiffres, tiret ou souligné.'
  if (!f.charte) erreurs.value.charte = 'Accepte la charte pour créer ton compte.'
  if (!f.majeur) erreurs.value.majeur = 'Il faut avoir 18 ans ou plus.'
  if (Object.keys(erreurs.value).length) {
    await nextTick()
    formulaire.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  occupe.value = true
  try {
    await $fetch('/api/compte', { method: 'POST', body: { ...f } })
    await charger()
    // Le formulaire a disparu : le focus va au titre de l'état, lu par les lecteurs d'écran.
    await nextTick()
    titreEtat.value?.focus()
  } catch (e) {
    const err = e as { statusCode?: number; data?: { message?: string } }
    const message = err.data?.message ?? 'Une erreur est survenue.'
    if (err.statusCode === 409 && message.includes('pseudo')) {
      erreurs.value.pseudo = message
      await nextTick()
      formulaire.value?.querySelector<HTMLElement>('#pseudo')?.focus()
    } else alerte.value = message
  } finally {
    occupe.value = false
  }
}

const champ = (n: 'pseudo' | 'charte' | 'majeur', aide?: string) => ({
  'aria-invalid': erreurs.value[n] ? ('true' as const) : undefined,
  'aria-describedby': [aide, erreurs.value[n] ? `err-${n}` : undefined].filter(Boolean).join(' ') || undefined,
})
</script>

<template>
  <section class="section">
    <div class="wrap texte texte--etroit">
      <h1>Mon compte</h1>
      <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>

      <template v-if="!user">
        <p class="lead">
          Pour participer, connecte-toi avec GitHub. Nous ne demandons que ton identité et ton e-mail, jamais l'accès à tes
          dépôts. Ensuite tu acceptes la charte, tu déclares ta majorité et tu choisis ton pseudo.
        </p>
        <p class="btns"><button class="btn btn--primary" type="button" :disabled="!pret" @click="connecter">Se connecter avec GitHub</button></p>
        <p v-if="!pret" class="note-claire">Le bouton s'active dès que la page est chargée.</p>
      </template>

      <p v-else-if="!pret || chargement">Chargement de ton compte…</p>

      <template v-else-if="!compte">
        <p class="lead">Tu es connecté avec GitHub. Crée ton compte Code Tank&nbsp;: la charte, ta majorité et ton pseudo.</p>
        <form ref="formulaire" class="form" novalidate @submit.prevent="creer">
          <div role="status" aria-live="polite" class="form__resume">
            <p v-if="Object.keys(erreurs).length">{{ Object.keys(erreurs).length === 1 ? 'Un champ est à corriger.' : `${Object.keys(erreurs).length} champs sont à corriger.` }}</p>
          </div>

          <div class="champ">
            <label for="pseudo">Pseudo</label>
            <p id="aide-pseudo" class="champ__aide">
              La seule chose publique. Il peut être ton identifiant GitHub. Il ne pourra plus être changé.
            </p>
            <input id="pseudo" v-model="f.pseudo" type="text" autocomplete="nickname" autocapitalize="none" spellcheck="false" maxlength="39" required v-bind="champ('pseudo', 'aide-pseudo')">
            <p v-if="erreurs.pseudo" id="err-pseudo" class="champ__erreur">{{ erreurs.pseudo }}</p>
          </div>

          <div class="champ champ--case">
            <input id="charte" v-model="f.charte" type="checkbox" required v-bind="champ('charte')">
            <label for="charte">J'ai lu et j'accepte <NuxtLink to="/charte" target="_blank">la charte</NuxtLink> (version du {{ VERSION }}).</label>
            <p v-if="erreurs.charte" id="err-charte" class="champ__erreur">{{ erreurs.charte }}</p>
          </div>
          <div class="champ champ--case">
            <input id="majeur" v-model="f.majeur" type="checkbox" required v-bind="champ('majeur')">
            <label for="majeur">J'ai 18 ans ou plus.</label>
            <p v-if="erreurs.majeur" id="err-majeur" class="champ__erreur">{{ erreurs.majeur }}</p>
          </div>

          <p class="btns"><button class="btn btn--primary" type="submit" :disabled="occupe">{{ occupe ? 'Envoi en cours…' : 'Créer mon compte' }}</button></p>
        </form>
        <p class="btns deconnexion"><button class="btn" type="button" @click="deconnecter">Se déconnecter</button></p>
      </template>

      <template v-else>
        <h2 ref="titreEtat" tabindex="-1">État</h2>
        <p class="etat etat--console" :data-etat="compte.etat">{{ ETATS[compte.etat as Etat] }}</p>
        <div class="champ">
          <label for="pseudo-fige">Pseudo</label>
          <p id="aide-pseudo-fige" class="champ__aide">Figé&nbsp;: c'est ton nom public, il ne se change pas.</p>
          <input id="pseudo-fige" type="text" :value="compte.pseudo" readonly aria-describedby="aide-pseudo-fige">
        </div>
        <p class="btns deconnexion"><button class="btn" type="button" @click="deconnecter">Se déconnecter</button></p>
      </template>
    </div>
  </section>
</template>
