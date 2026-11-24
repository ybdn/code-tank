<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Réglages' })

const { data } = await useLectureAdmin<{ plafond_comptes: number | null; plafond_depense_usd: number }>('/api/admin/reglages')
const f = reactive({ plafond_comptes: data.value.plafond_comptes as number | null | '', plafond_depense_usd: data.value.plafond_depense_usd })
const { occupe, message, alerte, erreurs, lancer } = useAction()
const locales = ref<ErreursReglages>({})
const toutes = computed<Record<string, string | undefined>>(() => ({ ...erreurs.value, ...locales.value }))
const nb = computed(() => Object.values(toutes.value).filter(Boolean).length)
const formulaire = useTemplateRef<HTMLFormElement>('formulaire')

// Un champ numérique vidé vaut '' : « pas de plafond ».
const corps = () => ({ plafond_comptes: f.plafond_comptes === '' ? null : f.plafond_comptes, plafond_depense_usd: f.plafond_depense_usd })

async function enregistrer() {
  locales.value = validerReglages(corps()).erreurs
  if (Object.keys(locales.value).length) return focaliser()
  await lancer(() => $fetch('/api/admin/reglages', { method: 'PATCH', body: corps() }), 'Réglages enregistrés.')
  await focaliser()
}
async function focaliser() {
  await nextTick()
  formulaire.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}
const champ = (n: string, aide: string) => ({
  'aria-invalid': toutes.value[n] ? ('true' as const) : undefined,
  'aria-describedby': [aide, toutes.value[n] ? `err-${n}` : undefined].filter(Boolean).join(' '),
})
</script>

<template>
  <section class="section">
    <div class="wrap">
      <h1>Réglages</h1>
      <div role="status" aria-live="polite"><p v-if="message" class="avis">{{ message }}</p></div>
      <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>

      <form ref="formulaire" class="form" novalidate @submit.prevent="enregistrer">
        <div role="status" aria-live="polite" class="form__resume">
          <p v-if="nb">{{ nb === 1 ? 'Un champ est à corriger.' : `${nb} champs sont à corriger.` }}</p>
        </div>
        <div class="champ">
          <label for="plafond_comptes">Plafond de comptes</label>
          <p id="aide-plafond" class="champ__aide">Comptes vérifiés ou autorisés au total. Au-delà, les nouveaux comptes vérifiés vont en liste d'attente. Vide&nbsp;: pas de plafond.</p>
          <input id="plafond_comptes" v-model.number="f.plafond_comptes" type="number" min="0" step="1" inputmode="numeric" v-bind="champ('plafond_comptes', 'aide-plafond')">
          <p v-if="toutes.plafond_comptes" id="err-plafond_comptes" class="champ__erreur">{{ toutes.plafond_comptes }}</p>
        </div>
        <div class="champ">
          <label for="plafond_depense_usd">Plafond de dépense (dollars)</label>
          <p id="aide-depense" class="champ__aide">Dépense maximale de l'API Claude pour une campagne (SPECS § 6).</p>
          <input id="plafond_depense_usd" v-model.number="f.plafond_depense_usd" type="number" min="0.01" step="0.01" inputmode="decimal" required v-bind="champ('plafond_depense_usd', 'aide-depense')">
          <p v-if="toutes.plafond_depense_usd" id="err-plafond_depense_usd" class="champ__erreur">{{ toutes.plafond_depense_usd }}</p>
        </div>
        <p class="btns"><button class="btn btn--primary" type="submit" :disabled="occupe">{{ occupe ? 'Enregistrement…' : 'Enregistrer' }}</button></p>
      </form>
    </div>
  </section>
</template>
