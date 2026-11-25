<script setup lang="ts">
useHead({ title: 'Ma campagne' })

const route = useRoute()
const router = useRouter()
// Sans session : 401, la page renvoie vers /compte. Compte actif sans campagne active : le formulaire de création.
type Ligne = { slug: string; titre: string; statut: string; date_resultats: string; bloquee_le: string | null }
const { data, error, status, refresh } = await useFetch<{ etat: string | null; campagnes: Ligne[] }>('/api/boss')
// Un brouillon échu et non bloqué ne compte pas : creer_campagne le fait passer en expiree.
const active = computed(() => data.value?.campagnes.find((c) => STATUTS_ACTIFS.includes(c.statut) && !brouillonEchu(c)))
const occupe = ref(false)
const alerte = ref('')
const zoneAlerte = useTemplateRef<HTMLElement>('zoneAlerte')
const titre = useTemplateRef<HTMLElement>('titre')
// Retour d'une suppression : le message est déjà là au chargement, donc le focus va au titre pour qu'il soit lu ; le
// paramètre est retiré pour qu'un rechargement ne l'annonce pas de nouveau.
const supprime = ref(!!route.query.supprime)
onMounted(() => {
  if (!supprime.value) return
  titre.value?.focus()
  router.replace({ query: {} })
})

async function creer(corps: Record<string, unknown>) {
  occupe.value = true
  alerte.value = ''
  try {
    const { slug } = await $fetch<{ slug: string }>('/api/boss', { method: 'POST', body: corps })
    await navigateTo(`/boss/${slug}?cree=1`)
  } catch (e) {
    const err = e as { statusCode?: number; data?: { message?: string } }
    alerte.value = err.data?.message ?? 'Une erreur est survenue.'
    // Une campagne a pu être créée entre-temps (autre onglet) : la page affiche alors son lien. Le formulaire reste monté
    // pendant le rechargement : la saisie n'est pas perdue.
    if (err.statusCode === 409) await refresh()
    await nextTick()
    // Le focus va au lien de la campagne existante s'il est apparu, sinon au refus : dans les deux cas, le message est lu.
    ;(document.querySelector<HTMLElement>('#lien-active') ?? zoneAlerte.value)?.focus()
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <section class="section">
    <div class="wrap texte texte--etroit">
      <h1 ref="titre" tabindex="-1">Ma campagne</h1>
      <p v-if="supprime" role="status" class="avis">Brouillon supprimé.</p>
      <!-- Hors des branches : le refus reste lu même quand le formulaire laisse place au lien de la campagne existante. -->
      <div ref="zoneAlerte" tabindex="-1">
        <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
      </div>
      <!-- Chargement seulement au premier affichage : un rechargement garde le formulaire et sa saisie. -->
      <p v-if="status === 'pending' && !data">Chargement…</p>
      <p v-else-if="error?.statusCode === 401">Pour créer une campagne, <NuxtLink to="/compte">connecte-toi</NuxtLink> avec un compte actif.</p>
      <p v-else-if="error" role="alert" class="avis avis--erreur">Tes campagnes ne peuvent pas être lues pour le moment.</p>
      <template v-else-if="active">
        <p>Tu as une campagne en cours, une seule à la fois&nbsp;: <NuxtLink id="lien-active" :to="`/boss/${active.slug}`">{{ active.titre }}</NuxtLink> ({{ STATUT_BOSS[active.statut] }}).</p>
      </template>
      <p v-else-if="data?.etat !== 'actif'">
        Seul un compte actif crée une campagne. <NuxtLink to="/compte">{{ data?.etat ? 'Voir l\'état de ton compte' : 'Crée ton compte' }}</NuxtLink>.
      </p>
      <template v-else>
        <p class="lead">Crée ta campagne en brouillon&nbsp;: tu en es le Boss. Tu la règles tant que tu veux avant de l'ouvrir.</p>
        <FormulaireCampagne :occupe="occupe" @envoyer="creer" />
      </template>
    </div>
  </section>
</template>
