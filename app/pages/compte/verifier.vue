<script setup lang="ts">
useHead({ title: 'Confirmer mon adresse', meta: [{ name: 'robots', content: 'noindex' }] })

// Le lien de l'e-mail ne valide rien à lui seul : il faut ce clic.
const jeton = String(useRoute().query.jeton ?? '')
const occupe = ref(false)
const resultat = ref<'ok' | 'expire' | 'invalide' | 'erreur' | null>(null)
const MESSAGES = {
  ok: 'Ton adresse e-mail est vérifiée.',
  expire: 'Ce lien a expiré (il dure 24 heures). Demande-en un nouveau depuis ta page de compte.',
  invalide: 'Ce lien n\'est pas valable : il a peut-être été remplacé. Demande-en un nouveau depuis ta page de compte.',
  erreur: 'La confirmation a échoué. Réessaie dans un instant.',
}

async function confirmer() {
  occupe.value = true
  try {
    resultat.value = (await $fetch<{ resultat: 'ok' | 'expire' | 'invalide' }>('/api/compte/verifier', { method: 'POST', body: { jeton } })).resultat
  } catch {
    resultat.value = 'erreur'
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <section class="section">
    <div class="wrap texte">
      <h1>Confirmer mon adresse</h1>
      <div role="status" aria-live="polite">
        <p v-if="resultat" class="avis" :class="{ 'avis--erreur': resultat !== 'ok' }">{{ MESSAGES[resultat] }}</p>
      </div>
      <template v-if="resultat !== 'ok'">
        <p class="lead">Un dernier clic pour confirmer que cette adresse e-mail est bien la tienne.</p>
        <p class="btns"><button class="btn btn--primary" type="button" :disabled="occupe || !jeton" @click="confirmer">Confirmer mon adresse</button></p>
      </template>
      <p><NuxtLink class="btn" to="/compte">Aller à mon compte</NuxtLink></p>
    </div>
  </section>
</template>
