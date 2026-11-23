<script setup lang="ts">
// Suppression du compte par son titulaire (SPECS § 9), confirmée par la saisie du pseudo exact.
defineProps<{ pseudo: string }>()
const supabase = useSupabaseClient()
const saisie = ref('')
const occupe = ref(false)
const erreur = ref('')
const alerte = ref('')
const champ = useTemplateRef<HTMLInputElement>('champ')

async function supprimer() {
  occupe.value = true
  erreur.value = alerte.value = ''
  try {
    await $fetch('/api/compte', { method: 'DELETE', body: { pseudo: saisie.value } })
  } catch (e) {
    const err = e as { data?: { statusMessage?: string; data?: { erreurs?: { pseudo?: string } } } }
    erreur.value = err.data?.data?.erreurs?.pseudo ?? ''
    if (erreur.value) champ.value?.focus()
    else alerte.value = err.data?.statusMessage ?? 'La suppression a échoué.'
    return
  } finally {
    occupe.value = false
  }
  // Le jeton n'est plus valable côté Auth : seule la session de ce navigateur est à effacer.
  await supabase.auth.signOut({ scope: 'local' })
  await navigateTo('/?compte=supprime')
}
</script>

<template>
  <section aria-labelledby="suppression-titre">
    <h2 id="suppression-titre">Supprimer mon compte</h2>
    <p>La suppression est immédiate et ne se défait pas. Elle efface ton compte, avec tout ce qui te concerne :</p>
    <ul>
      <li>ton vrai nom, ton e-mail, ta motivation, le dépôt cité et les données lues sur GitHub ;</li>
      <li>tes inscriptions, tes dépôts et leurs archives, ta présentation, ta demande au jury et tes déclarations ;</li>
      <li>tes rapports et tes entretiens.</li>
    </ul>
    <p>
      Seule reste, pour une campagne dont les résultats sont publiés, ta ligne du classement, sous le nom « candidat supprimé »,
      avec ses scores et ses notes. Elle ne contient plus rien qui permette de t'identifier. Une campagne non publiée ne garde rien de toi.
    </p>
    <form class="form" novalidate @submit.prevent="supprimer">
      <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
      <div class="champ">
        <label for="confirmation-pseudo">Pour confirmer, saisis ton pseudo : {{ pseudo }}</label>
        <input
          id="confirmation-pseudo" ref="champ" v-model="saisie" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
          :aria-invalid="erreur ? 'true' : undefined" :aria-describedby="erreur ? 'err-confirmation-pseudo' : undefined"
        >
        <p v-if="erreur" id="err-confirmation-pseudo" role="alert" class="champ__erreur">{{ erreur }}</p>
      </div>
      <p class="btns"><button class="btn" type="submit" :disabled="occupe">Supprimer définitivement mon compte</button></p>
    </form>
  </section>
</template>
