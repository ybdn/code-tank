<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const slug = route.params.slug as string
// L'API répond 404 à tout autre compte que le Boss, visiteur compris : la page aussi.
const { data, error, refresh } = await useFetch<CampagneBoss>(`/api/boss/${encodeURIComponent(slug)}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Page introuvable', fatal: true })
useHead({ title: () => data.value?.titre ?? 'Ma campagne' })

// Échue : date des résultats passée ; la base refuse alors toute action du Boss (campagne_vivante).
const echue = computed(() => !!data.value && Date.parse(data.value.date_resultats) < Date.now())
// Actions du Boss (réglage, suppression) : compte actif, campagne ni bloquée ni échue. La base revérifie tout.
const actif = computed(() => !!data.value && data.value.compte_actif && !data.value.bloquee_le && !echue.value)
// Réglable en brouillon ou ouverte, tant que les règles ne sont pas figées.
const reglable = computed(() => actif.value && ['brouillon', 'ouverte'].includes(data.value!.statut) && !data.value!.regles_figees_le)
const occupe = ref(false)
const annonce = ref(route.query.cree ? 'Brouillon créé.' : '')
const alerte = ref('')
const titre = useTemplateRef<HTMLElement>('titre')
const zoneAlerte = useTemplateRef<HTMLElement>('zoneAlerte')
// Le paramètre est retiré après l'annonce : un rechargement ne la répète pas.
onMounted(() => {
  if (!route.query.cree) return
  titre.value?.focus()
  router.replace({ query: {} })
})

async function echec(e: unknown) {
  const err = e as { statusCode?: number; data?: { message?: string } }
  alerte.value = err.data?.message ?? 'Une erreur est survenue.'
  // Une règle a pu changer entre-temps (règles figées, blocage) : la page se remet à jour.
  if (err.statusCode === 409) await refresh()
  await nextTick()
  zoneAlerte.value?.focus()
}

async function enregistrer(corps: Record<string, unknown>) {
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await $fetch(`/api/boss/${encodeURIComponent(slug)}`, { method: 'PATCH', body: corps })
    await refresh()
    annonce.value = 'Campagne enregistrée.'
  } catch (e) {
    await echec(e)
  } finally {
    occupe.value = false
  }
}

async function supprimer() {
  // aria-disabled plutôt que disabled : le bouton garde le focus pendant l'envoi.
  if (occupe.value || !confirm('Supprimer ce brouillon ? Il disparaît pour de bon.')) return
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await $fetch(`/api/boss/${encodeURIComponent(slug)}`, { method: 'DELETE', body: {} })
    await navigateTo('/boss?supprime=1')
  } catch (e) {
    await echec(e)
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <section class="section">
    <div class="wrap texte texte--etroit">
      <p v-if="error" role="alert" class="avis avis--erreur">La campagne ne peut pas être lue pour le moment.</p>
      <template v-else-if="data">
        <h1 ref="titre" tabindex="-1">{{ data.titre }}</h1>
        <p class="etat etat--console" :data-etat="data.statut">{{ STATUT_BOSS[data.statut] }}<template v-if="data.bloquee_le"> · bloquée</template></p>
        <p role="status" aria-live="polite">{{ annonce }}</p>
        <div ref="zoneAlerte" tabindex="-1">
          <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
        </div>
        <FormulaireCampagne v-if="reglable" :initial="data" :occupe="occupe" @envoyer="enregistrer" />
        <p v-else-if="!data.compte_actif">Ton compte n'est pas actif.</p>
        <p v-else>Les réglages ne se modifient plus&nbsp;: {{ data.bloquee_le ? 'la campagne est bloquée.' : echue ? 'la date des résultats est passée.' : 'les règles sont figées à cette étape.' }}</p>
        <template v-if="data.statut === 'brouillon' && actif">
          <h2>Supprimer le brouillon</h2>
          <p>Tu changes d'avis&nbsp;? Le brouillon disparaît pour de bon.</p>
          <p class="btns"><button class="btn btn--danger" type="button" :aria-disabled="occupe" @click="supprimer">Supprimer le brouillon</button></p>
        </template>
      </template>
    </div>
  </section>
</template>
