<script setup lang="ts">
// Formulaire de profil : création du compte (avec charte et majorité) ou modification.
const props = defineProps<{
  creation: boolean
  initial?: Profil
  pseudoFige?: boolean
  erreurs: ErreursProfil
  occupe: boolean
}>()
const emit = defineEmits<{ envoyer: [corps: Record<string, unknown>] }>()

const f = reactive({
  vrai_nom: props.initial?.vrai_nom ?? '',
  pseudo: props.initial?.pseudo ?? '',
  email_contact: props.initial?.email_contact ?? '',
  motivation: props.initial?.motivation ?? '',
  depot_cite_url: props.initial?.depot_cite_url ?? '',
  charte: false,
  majeur: false,
})
const locales = ref<ErreursProfil>({})
const toutes = computed<ErreursProfil>(() => ({ ...props.erreurs, ...locales.value }))
const nb = computed(() => Object.keys(toutes.value).length)
const formulaire = useTemplateRef<HTMLFormElement>('formulaire')

async function soumettre() {
  const corps: Record<string, unknown> = { ...f }
  if (props.pseudoFige) delete corps.pseudo
  const { profil, erreurs } = props.creation ? validerCreation(corps) : { profil: nettoyerProfil(corps), erreurs: {} }
  locales.value = props.creation ? erreurs : validerProfil(props.pseudoFige ? { ...profil, pseudo: undefined } : profil)
  if (Object.keys(locales.value).length) {
    await nextTick()
    formulaire.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  emit('envoyer', corps)
}
// Les erreurs du serveur sont aussi amenées au premier champ fautif.
watch(() => props.erreurs, async () => {
  await nextTick()
  formulaire.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
})
const champ = (n: keyof ErreursProfil, aide?: string) => ({
  'aria-invalid': toutes.value[n] ? ('true' as const) : undefined,
  'aria-describedby': [aide, toutes.value[n] ? `err-${n}` : undefined].filter(Boolean).join(' ') || undefined,
})
</script>

<template>
  <form ref="formulaire" class="form" novalidate @submit.prevent="soumettre">
    <div role="status" aria-live="polite" class="form__resume">
      <p v-if="nb">{{ nb === 1 ? 'Un champ est à corriger.' : `${nb} champs sont à corriger.` }}</p>
    </div>

    <div class="champ">
      <label for="vrai_nom">Vrai nom</label>
      <p id="aide-nom" class="champ__aide">Visible de l'organisateur seul, jamais public.</p>
      <input id="vrai_nom" v-model="f.vrai_nom" type="text" autocomplete="name" maxlength="100" required v-bind="champ('vrai_nom', 'aide-nom')">
      <p v-if="toutes.vrai_nom" id="err-vrai_nom" class="champ__erreur">{{ toutes.vrai_nom }}</p>
    </div>

    <div class="champ">
      <label for="pseudo">Pseudo</label>
      <p id="aide-pseudo" class="champ__aide">
        <template v-if="pseudoFige">Figé : ton compte est autorisé, et l'organisateur l'a validé avec ce pseudo, qui est public.</template>
        <template v-else>La seule chose publique (classement, résultats). Il peut être ton identifiant GitHub.</template>
      </p>
      <input id="pseudo" v-model="f.pseudo" type="text" maxlength="30" :readonly="pseudoFige" required v-bind="champ('pseudo', 'aide-pseudo')">
      <p v-if="toutes.pseudo" id="err-pseudo" class="champ__erreur">{{ toutes.pseudo }}</p>
    </div>

    <div class="champ">
      <label for="email_contact">E-mail de contact</label>
      <p id="aide-email" class="champ__aide">Nous y envoyons le lien de vérification. Les adresses jetables sont refusées. Changer d'adresse annule la vérification.</p>
      <input id="email_contact" v-model="f.email_contact" type="email" autocomplete="email" maxlength="254" required v-bind="champ('email_contact', 'aide-email')">
      <p v-if="toutes.email_contact" id="err-email_contact" class="champ__erreur">{{ toutes.email_contact }}</p>
    </div>

    <div class="champ">
      <label for="motivation">Motivation</label>
      <p id="aide-motivation" class="champ__aide">Trois lignes : ce que tu codes, pourquoi tu candidates.</p>
      <textarea id="motivation" v-model="f.motivation" rows="4" maxlength="1000" required v-bind="champ('motivation', 'aide-motivation')" />
      <p v-if="toutes.motivation" id="err-motivation" class="champ__erreur">{{ toutes.motivation }}</p>
    </div>

    <div class="champ">
      <label for="depot_cite_url">Un dépôt dont tu es fier</label>
      <p id="aide-depot" class="champ__aide">Lien https:// vers un projet à toi.</p>
      <input id="depot_cite_url" v-model="f.depot_cite_url" type="url" maxlength="300" required v-bind="champ('depot_cite_url', 'aide-depot')">
      <p v-if="toutes.depot_cite_url" id="err-depot_cite_url" class="champ__erreur">{{ toutes.depot_cite_url }}</p>
    </div>

    <template v-if="creation">
      <div class="champ champ--case">
        <input id="charte" v-model="f.charte" type="checkbox" required v-bind="champ('charte')">
        <label for="charte">J'ai lu et j'accepte <NuxtLink to="/charte" target="_blank">la charte</NuxtLink> du concours.</label>
        <p v-if="toutes.charte" id="err-charte" class="champ__erreur">{{ toutes.charte }}</p>
      </div>
      <div class="champ champ--case">
        <input id="majeur" v-model="f.majeur" type="checkbox" required v-bind="champ('majeur')">
        <label for="majeur">J'ai 18 ans ou plus.</label>
        <p v-if="toutes.majeur" id="err-majeur" class="champ__erreur">{{ toutes.majeur }}</p>
      </div>
    </template>

    <p class="btns"><button class="btn btn--primary" type="submit" :disabled="occupe">{{ creation ? 'Créer mon compte' : 'Enregistrer' }}</button></p>
  </form>
</template>
