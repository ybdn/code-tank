<script setup lang="ts">
useHead({ title: 'Ma campagne' })

const route = useRoute()
// Sans session : 401, la page renvoie vers /compte. Sans campagne active : le formulaire de création.
const { data, error, status } = await useFetch<{ campagnes: { slug: string; titre: string; statut: string }[] }>('/api/boss')
const active = computed(() => data.value?.campagnes.find((c) => STATUTS_ACTIFS.includes(c.statut)))
const occupe = ref(false)
const alerte = ref('')
const zoneAlerte = useTemplateRef<HTMLElement>('zoneAlerte')

async function creer(corps: Record<string, unknown>) {
  occupe.value = true
  alerte.value = ''
  try {
    const { slug } = await $fetch<{ slug: string }>('/api/boss', { method: 'POST', body: corps })
    await navigateTo(`/boss/${slug}?cree=1`)
  } catch (e) {
    alerte.value = (e as { data?: { message?: string } }).data?.message ?? 'Une erreur est survenue.'
    // Le refus s'affiche au-dessus du formulaire : le focus y va, le message est lu.
    await nextTick()
    zoneAlerte.value?.focus()
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <section class="section">
    <div class="wrap texte texte--etroit">
      <h1>Ma campagne</h1>
      <p v-if="route.query.supprime" role="status" class="avis">Brouillon supprimé.</p>
      <p v-if="status === 'pending'">Chargement…</p>
      <p v-else-if="error?.statusCode === 401">Pour créer une campagne, <NuxtLink to="/compte">connecte-toi</NuxtLink> avec un compte actif.</p>
      <p v-else-if="error" role="alert" class="avis avis--erreur">Tes campagnes ne peuvent pas être lues pour le moment.</p>
      <template v-else-if="active">
        <p>Tu as une campagne en cours, une seule à la fois&nbsp;: <NuxtLink :to="`/boss/${active.slug}`">{{ active.titre }}</NuxtLink> ({{ STATUT_BOSS[active.statut] }}).</p>
      </template>
      <template v-else>
        <p class="lead">Crée ta campagne en brouillon&nbsp;: tu en es le Boss. Tu la règles tant que tu veux avant de l'ouvrir.</p>
        <div ref="zoneAlerte" tabindex="-1">
          <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
        </div>
        <FormulaireCampagne :occupe="occupe" @envoyer="creer" />
      </template>
    </div>
  </section>
</template>
