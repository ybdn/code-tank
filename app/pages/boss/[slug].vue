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
// Ouvrable : brouillon d'un Boss actif, ni bloqué ni échu, dont la clôture des dépôts est à venir (sinon ouvrir_campagne refuse).
const clotureAVenir = computed(() => !!data.value && Date.parse(data.value.cloture_depot) > Date.now())
// Visible du public : ni brouillon, ni expirée, ni bloquée (vue campagne_phase).
const publiee = computed(() => !!data.value && !['brouillon', 'expiree'].includes(data.value.statut) && !data.value.bloquee_le)
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

async function ouvrir() {
  if (occupe.value || !confirm('Ouvrir la campagne ? Elle devient visible et ne revient plus en brouillon.')) return
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await $fetch(`/api/boss/${encodeURIComponent(slug)}/ouverture`, { method: 'POST', body: {} })
    await refresh()
    annonce.value = 'Campagne ouverte.'
    // Le bouton a disparu : le focus revient au titre, l'annonce est lue par la zone role="status".
    await nextTick()
    titre.value?.focus()
  } catch (e) {
    await echec(e)
  } finally {
    occupe.value = false
  }
}

// Lien d'invitation (story 2.4) : URL absolue à partir de l'origine de la requête, la même au rendu serveur et dans le navigateur.
const origine = useRequestURL().origin
const lien = computed(() => data.value?.jeton_invitation ? `${origine}/invitation/${data.value.jeton_invitation}` : '')
const annonceLien = ref('')
const titreLien = useTemplateRef<HTMLElement>('titreLien')

async function copier() {
  try {
    await navigator.clipboard.writeText(lien.value)
    annonceLien.value = 'Lien copié.'
  } catch {
    annonceLien.value = 'La copie a échoué : sélectionne le lien et copie-le.'
  }
}

async function regenerer() {
  if (occupe.value || !confirm('Régénérer le lien ? L\'ancien n\'ouvrira plus rien.')) return
  occupe.value = true
  annonceLien.value = ''
  alerte.value = ''
  try {
    const r = await $fetch<{ jeton_invitation: string }>(`/api/boss/${encodeURIComponent(slug)}/invitation`, { method: 'POST', body: {} })
    // Le nouveau jeton vient de la réponse : pas de relecture qui pourrait échouer après une régénération réussie.
    data.value = { ...data.value!, jeton_invitation: r.jeton_invitation }
    annonceLien.value = 'Nouveau lien créé : l\'ancien n\'ouvre plus rien.'
    await nextTick()
    titreLien.value?.focus()
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
        <p v-if="publiee" class="btns"><NuxtLink class="btn" :to="`/campagnes/${data.slug}`">Voir sa page publique</NuxtLink></p>
        <template v-if="lien">
          <h2 ref="titreLien" tabindex="-1">Lien d'invitation</h2>
          <p>Seuls ceux qui ont ce lien entrent dans la campagne.{{ data.statut === 'brouillon' ? ' Il y mène dès son ouverture.' : '' }}</p>
          <div class="champ"><label for="lien-invitation">Lien</label><input id="lien-invitation" type="text" readonly :value="lien"></div>
          <p class="btns"><button class="btn" type="button" @click="copier">Copier</button></p>
          <p role="status" aria-live="polite">{{ annonceLien }}</p>
          <template v-if="actif">
            <p>Le régénérer crée un nouveau lien&nbsp;: l'ancien n'ouvrira plus rien, les inscrits gardent leur accès.</p>
            <p class="btns"><button class="btn" type="button" :aria-disabled="occupe" @click="regenerer">Régénérer le lien</button></p>
          </template>
          <p v-else>Le lien ne se régénère plus&nbsp;: {{ !data.compte_actif ? 'ton compte n\'est pas actif.' : data.bloquee_le ? 'la campagne est bloquée.' : 'la date des résultats est passée.' }}</p>
        </template>
        <p v-if="data.role_boss === 'juge'">Tu juges cette campagne&nbsp;: ton vote compte pour 33&nbsp;% du score final.</p>
        <template v-if="data.statut === 'brouillon' && actif">
          <h2>Ouvrir la campagne</h2>
          <template v-if="clotureAVenir">
            <p>{{ data.visibilite === 'publique' ? 'Elle apparaît sur l\'accueil et chacun peut lire ses règles.' : 'Elle reste hors de l\'accueil : seuls ses invités la verront.' }}</p>
            <p class="btns"><button class="btn btn--primary" type="button" :aria-disabled="occupe" @click="ouvrir">Ouvrir la campagne</button></p>
          </template>
          <p v-else>La clôture des dépôts est passée&nbsp;: règle de nouvelles dates pour l'ouvrir.</p>
        </template>
        <FormulaireCampagne v-if="reglable" :initial="data" :occupe="occupe" @envoyer="enregistrer" />
        <p v-else-if="!data.compte_actif">Ton compte n'est pas actif.</p>
        <p v-else>Les réglages ne se modifient plus&nbsp;: {{ data.bloquee_le ? 'la campagne est bloquée.' : echue ? 'la date des résultats est passée.' : 'les règles sont figées à cette étape.' }}</p>
        <p v-if="data.compte_actif && brouillonEchu(data)" class="btns"><NuxtLink class="btn btn--primary" to="/boss">Créer une nouvelle campagne</NuxtLink></p>
        <template v-if="data.statut === 'brouillon' && actif">
          <h2>Supprimer le brouillon</h2>
          <p>Tu changes d'avis&nbsp;? Le brouillon disparaît pour de bon.</p>
          <p class="btns"><button class="btn btn--danger" type="button" :aria-disabled="occupe" @click="supprimer">Supprimer le brouillon</button></p>
        </template>
      </template>
    </div>
  </section>
</template>
