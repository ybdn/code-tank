<script setup lang="ts">
useHead({ title: 'Mode d\'accès' })

type Mode = 'ouvert' | 'liste_attente' | 'ferme'
const MODES: { valeur: Mode; libelle: string; aide: string }[] = [
  { valeur: 'ouvert', libelle: 'Ouvert', aide: 'Le compte naît actif.' },
  { valeur: 'liste_attente', libelle: 'Liste d\'attente', aide: 'Le compte naît en attente ; tu le fais entrer ensuite.' },
  { valeur: 'ferme', libelle: 'Fermé', aide: 'Aucune inscription ; les comptes existants se connectent normalement.' },
]
const libelle = (m: string) => MODES.find((x) => x.valeur === m)?.libelle ?? m

// Le serveur (server/middleware/admin.ts) répond 404 à tout autre compte : la navigation côté client affiche aussi le 404.
const { data, error } = await useFetch<{ mode: Mode }>('/api/admin/reglage')
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Page introuvable', fatal: true })

const choix = ref<string>(data.value?.mode ?? 'ouvert')
const occupe = ref(false)
const annonce = ref('')
const alerte = ref('')

async function enregistrer() {
  annonce.value = ''
  alerte.value = ''
  occupe.value = true
  try {
    const r = await $fetch<{ mode: Mode }>('/api/admin/reglage', { method: 'POST', body: { mode: choix.value } })
    data.value = r
    annonce.value = `Mode d'accès enregistré : ${libelle(r.mode)}.`
  } catch (e) {
    alerte.value = (e as { data?: { message?: string } }).data?.message ?? 'Une erreur est survenue.'
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <section class="section admin">
    <div class="wrap texte texte--etroit">
      <h1>Mode d'accès</h1>
      <p v-if="error" role="alert" class="avis avis--erreur">Le mode d'accès ne peut pas être lu pour le moment.</p>
      <template v-else-if="data">
        <p>Mode courant&nbsp;: <strong>{{ libelle(data.mode) }}</strong>.</p>
        <form class="form" @submit.prevent="enregistrer">
          <fieldset class="groupe">
            <legend>Création de comptes</legend>
            <div v-for="m in MODES" :key="m.valeur" class="champ champ--case">
              <input :id="`mode-${m.valeur}`" v-model="choix" type="radio" name="mode" :value="m.valeur" :aria-describedby="`aide-${m.valeur}`">
              <label :for="`mode-${m.valeur}`">{{ m.libelle }}</label>
              <p :id="`aide-${m.valeur}`" class="champ__aide">{{ m.aide }}</p>
            </div>
          </fieldset>
          <p class="btns"><button class="btn btn--primary" type="submit" :disabled="occupe">{{ occupe ? 'Enregistrement…' : 'Enregistrer' }}</button></p>
        </form>
        <p role="status" aria-live="polite">{{ annonce }}</p>
        <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
      </template>
    </div>
  </section>
</template>
