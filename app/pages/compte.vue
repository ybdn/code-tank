<script setup lang="ts">
useHead({ title: 'Mon compte' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const connecterGithub = useConnexionGithub()

type Etat = 'en_attente' | 'actif' | 'suspendu'
const ETATS: Record<Etat, string> = {
  en_attente: 'Ton compte est en attente : tu pourras participer dès qu\'il sera actif.',
  actif: 'Compte actif.',
  suspendu: 'Ton compte est suspendu.',
}
// Message fixe de changer_pseudo quand le compte n'est plus en attente.
const PSEUDO_FIGE = 'Ton pseudo ne se change plus : il est figé une fois ton compte actif.'
const VERSION = new Date(VERSION_CHARTE).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

// Le serveur ne voit pas toujours la session au rendu : tout se lit après le montage.
const pret = ref(false)
const compte = ref<{ pseudo: string; etat: string } | null>(null)
// Campagne active du compte (une au plus) : le lien mène à elle, sinon à la création ; lecture en échec (undefined) : lien
// neutre vers /boss.
const campagne = ref<{ slug: string } | null | undefined>(null)
const f = reactive({ pseudo: '', charte: false, majeur: false })
const erreurs = ref<Partial<Record<'pseudo' | 'charte' | 'majeur', string>>>({})
const occupe = ref(false)
const alerte = ref('')
const annonce = ref('')
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
  // En liste d'attente, le pseudo reste modifiable : le champ part du pseudo enregistré.
  if (data?.etat === 'en_attente') f.pseudo = data.pseudo
  // La RLS ne laisse lire que ses propres campagnes.
  if (data?.etat === 'actif') {
    const lue = await supabase.from('campagne').select('slug, statut, bloquee_le, date_resultats').in('statut', STATUTS_ACTIFS).maybeSingle()
    // Un brouillon échu ne compte plus : le lien mène à la création, comme sur /boss.
    campagne.value = lue.error ? undefined : lue.data && !brouillonEchu(lue.data) ? lue.data : null
  }
  chargement.value = false
}

onMounted(async () => {
  // Retour d'un échec de connexion GitHub : message fixe, jamais error_description (texte venu de l'URL).
  if (route.query.error || window.location.hash.includes('error=')) alerte.value = 'La connexion GitHub n\'a pas abouti. Réessaie.'
  if (user.value) await charger()
  pret.value = true
})
// Ne recharge qu'au changement de personne : un jeton rafraîchi ne démonte pas un formulaire en cours de saisie.
watch(user, async (u, ancien) => {
  if (!pret.value || u?.sub === ancien?.sub) return
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
  // aria-disabled plutôt que disabled : le bouton garde le focus pendant l'envoi (un refus 409 laisse le formulaire).
  if (occupe.value) return
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

async function changerPseudo() {
  // aria-disabled plutôt que disabled : le bouton garde le focus pendant l'envoi.
  if (occupe.value) return
  alerte.value = ''
  annonce.value = ''
  erreurs.value = {}
  const pseudo = f.pseudo.trim()
  if (!PSEUDO.test(pseudo)) erreurs.value.pseudo = 'Le pseudo fait 3 à 39 caractères : lettres sans accent, chiffres, tiret ou souligné.'
  else {
    occupe.value = true
    try {
      await $fetch('/api/compte/pseudo', { method: 'POST', body: { pseudo } })
      compte.value = { ...compte.value!, pseudo }
      annonce.value = 'Pseudo enregistré.'
      return
    } catch (e) {
      const err = e as { statusCode?: number; data?: { message?: string } }
      const message = err.data?.message ?? 'Une erreur est survenue.'
      if (err.statusCode === 409 && message === PSEUDO_FIGE) {
        // Le compte est devenu actif entre-temps : la page passe à l'état actif, pseudo figé.
        alerte.value = message
        await charger()
        await nextTick()
        titreEtat.value?.focus()
        return
      }
      if (err.statusCode === 409) erreurs.value.pseudo = message
      else alerte.value = message
    } finally {
      occupe.value = false
    }
  }
  await nextTick()
  if (erreurs.value.pseudo) document.querySelector<HTMLElement>('#pseudo-attente')?.focus()
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
              La seule chose publique. Il peut être ton identifiant GitHub. Il sera figé une fois ton compte actif.
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

          <p class="btns"><button class="btn btn--primary" type="submit" :aria-disabled="occupe">{{ occupe ? 'Envoi en cours…' : 'Créer mon compte' }}</button></p>
        </form>
        <p class="btns deconnexion"><button class="btn" type="button" @click="deconnecter">Se déconnecter</button></p>
      </template>

      <template v-else-if="compte.etat === 'en_attente'">
        <h2 ref="titreEtat" tabindex="-1">Tu es sur la liste d'attente</h2>
        <p class="etat etat--console" data-etat="en_attente">{{ ETATS.en_attente }}</p>
        <form class="form" novalidate @submit.prevent="changerPseudo">
          <div class="champ">
            <label for="pseudo-attente">Pseudo</label>
            <p id="aide-pseudo-attente" class="champ__aide">Modifiable tant que ton compte n'est pas actif, figé ensuite.</p>
            <input id="pseudo-attente" v-model="f.pseudo" type="text" autocomplete="nickname" autocapitalize="none" spellcheck="false" maxlength="39" required v-bind="champ('pseudo', 'aide-pseudo-attente')">
            <p v-if="erreurs.pseudo" id="err-pseudo" class="champ__erreur">{{ erreurs.pseudo }}</p>
          </div>
          <p class="btns"><button class="btn btn--primary" type="submit" :aria-disabled="occupe">{{ occupe ? 'Envoi en cours…' : 'Changer mon pseudo' }}</button></p>
        </form>
        <p role="status" aria-live="polite">{{ annonce }}</p>
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
        <p v-if="compte.etat === 'actif'" class="btns">
          <NuxtLink class="btn btn--primary" :to="campagne ? `/boss/${campagne.slug}` : '/boss'">{{ campagne === undefined ? 'Mes campagnes' : campagne ? 'Ma campagne' : 'Créer une campagne' }}</NuxtLink>
        </p>
        <p class="btns deconnexion"><button class="btn" type="button" @click="deconnecter">Se déconnecter</button></p>
      </template>
    </div>
  </section>
</template>
