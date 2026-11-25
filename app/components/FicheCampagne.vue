<script setup lang="ts">
// Fiche d'une campagne (story 2.2), pour sa page publique et pour sa page d'invitation (story 2.4, avec `jeton`, envoyé à
// l'inscription). L'API répond 404 pour un brouillon, une campagne bloquée ou expirée, une campagne sur invitation hors de
// son Boss et de ses inscrits, et un lien inconnu ou régénéré : la page aussi. Le lien d'invitation exige une session (401).
const props = defineProps<{ url: string; jeton?: string }>()
const url = props.url
type Page = CampagnePublique & { criteres: Critere[]; connecte: boolean; compte_actif: boolean; est_boss: boolean; inscrit: boolean; reception: ReceptionLue | null; depot: DepotLu | null }
const { data, error } = await useFetch<Page>(url)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Page introuvable', fatal: true })
useHead({ title: () => data.value?.titre ?? 'Campagne' })
const nomJure = (j: string) => j[0]!.toUpperCase() + j.slice(1)

// Inscription (story 2.3) : la page ne propose que l'action que sinscrire ou se_desinscrire accepteront, sinon une phrase
// qui dit pourquoi. La base revérifie tout.
const pourquoiPas = computed(() => {
  const c = data.value
  if (!c || c.inscrit) return ''
  if (!c.connecte) return 'Connecte-toi avec GitHub pour t\'inscrire.'
  if (!c.compte_actif) return 'Ton compte n\'est pas actif : tu ne peux pas t\'inscrire.'
  // Sur invitation : par le lien, ou pour son Boss (sinscrire accepte l'un et l'autre).
  if (c.visibilite === 'invitation' && !props.jeton && !c.est_boss) return 'Cette campagne se rejoint sur invitation.'
  if (c.phase !== 'inscriptions') return 'Les inscriptions ne sont pas ouvertes.'
  if (c.est_boss && c.role_boss === 'juge') return 'Tu juges cette campagne : tu ne t\'y inscris pas.'
  if (c.places_restantes <= 0) return 'La campagne est complète.'
  return ''
})
// Désinscription : tant que la délibération n'a pas commencé, compte actif, campagne non échue, sans dépôt ni réception en
// attente (story 3.3) ; sinon, pourquoi (une campagne bloquée n'est plus dans la vue : la page répond 404).
const pasDeRetrait = computed(() => {
  const c = data.value
  if (!c?.inscrit) return ''
  if (!c.compte_actif) return 'Ton compte n\'est pas actif : tu ne peux pas te désinscrire.'
  if (Date.parse(c.date_resultats) <= Date.now()) return 'Cette campagne est échue : on ne s\'en désinscrit plus.'
  if (c.statut !== 'ouverte') return 'La délibération a commencé : tu ne peux plus te désinscrire.'
  if (c.depot || c.reception?.statut === 'en_attente') return 'Retire d\'abord ton dépôt pour te désinscrire.'
  return ''
})
const connaissance = ref(false)
const occupe = ref(false)
const route = useRoute()
const router = useRouter()
// Arrivée depuis le lien d'invitation après l'inscription (?inscrit=1) : annonce, focus sur le titre de la section, puis
// paramètre retiré pour qu'un rechargement ne la répète pas.
const annonce = ref(route.query.inscrit && data.value?.inscrit ? 'Tu es inscrit.' : '')
const alerte = ref('')
const titreInscription = useTemplateRef<HTMLElement>('titreInscription')
const zoneAlerte = useTemplateRef<HTMLElement>('zoneAlerte')
const nonActualisee = ref(false)

// Relit la campagne sans toucher à ce qui est affiché en cas d'échec : la section, la confirmation et la cible du focus
// restent ; une phrase et un bouton « Actualiser » le disent.
async function actualiser() {
  try {
    data.value = await $fetch<Page>(url)
    nonActualisee.value = false
  } catch {
    nonActualisee.value = true
  }
}
async function relire() {
  if (occupe.value) return
  occupe.value = true
  await actualiser()
  occupe.value = false
}

// Une page ouverte avant l'ouverture des inscriptions passe à la phase d'inscription sans rechargement : relecture quand
// l'onglet redevient visible, et à l'heure d'ouverture si elle tombe dans moins de 24 h.
// shortcut: pas de minuteur au-delà de 24 h ; une page restée visible plus longtemps attend le retour sur l'onglet ou un rechargement. À chaîner si un besoin réel apparaît.
let minuterie: ReturnType<typeof setTimeout> | undefined
const auRetour = () => { if (document.visibilityState === 'visible') actualiser() }
onMounted(() => {
  if (route.query.inscrit) {
    titreInscription.value?.focus()
    router.replace({ query: {} })
  }
  document.addEventListener('visibilitychange', auRetour)
  const delai = data.value ? Date.parse(data.value.ouverture_inscriptions) - Date.now() : 0
  if (delai > 0 && delai < 86_400_000) minuterie = setTimeout(actualiser, delai + 1000)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', auRetour)
  clearTimeout(minuterie)
})

async function agir(methode: 'POST' | 'DELETE', fait: string) {
  // aria-disabled plutôt que disabled : le bouton garde le focus pendant l'envoi.
  if (occupe.value) return
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await $fetch(`/api/campagnes/${encodeURIComponent(data.value!.slug)}/inscription`, { method: methode, body: methode === 'POST' ? { connaissance: connaissance.value, jeton: props.jeton } : {} })
    // Inscrit par le lien : il passe sur l'adresse de la campagne, qui reste la sienne, alors que le lien mourra à la
    // prochaine régénération.
    if (methode === 'POST' && props.jeton) return await navigateTo(`/campagnes/${data.value!.slug}?inscrit=1`, { replace: true })
    await actualiser()
    connaissance.value = false
    annonce.value = fait
    // Le bouton a disparu : le focus revient au titre de la section, l'annonce est lue par la zone role="status".
    await nextTick()
    titreInscription.value?.focus()
  } catch (e) {
    const err = e as { statusCode?: number; data?: { message?: string } }
    alerte.value = err.data?.message ?? 'Une erreur est survenue.'
    // Une règle a pu changer entre-temps (complet, phase) : la page se remet à jour sans démonter la section.
    if (err.statusCode === 409) await actualiser()
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
      <template v-if="error?.statusCode === 401 && !data">
        <h1>Invitation</h1>
        <p>Connecte-toi avec GitHub pour voir cette campagne et t'y inscrire, puis rouvre ce lien.</p>
        <p class="btns"><NuxtLink class="btn btn--primary" to="/compte">Me connecter</NuxtLink></p>
      </template>
      <p v-else-if="error && !data" role="alert" class="avis avis--erreur">La campagne ne peut pas être lue pour le moment.</p>
      <template v-else-if="data">
        <h1>{{ data.titre }}</h1>
        <p class="etat etat--console">{{ LIBELLE_PHASE[data.phase] }}<template v-if="data.visibilite === 'invitation'"> · sur invitation</template></p>
        <p class="lead">{{ data.theme }}</p>
        <p>Campagne de {{ data.boss_pseudo }}, {{ data.role_boss === 'juge' ? 'qui la juge' : 'qui la joue avec vous' }}.</p>

        <h2 ref="titreInscription" tabindex="-1">Inscription</h2>
        <p role="status" aria-live="polite">{{ annonce }}</p>
        <p v-if="nonActualisee">La page n'a pas pu être actualisée. <button class="btn" type="button" :aria-disabled="occupe" @click="relire">Actualiser</button></p>
        <div ref="zoneAlerte" tabindex="-1">
          <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
        </div>
        <!-- Données périmées (actualisation échouée) : aucune action, qui partirait sur un état faux et finirait en 409. -->
        <template v-if="nonActualisee" />
        <template v-else-if="data.inscrit">
          <p>Tu es inscrit.<template v-if="jeton"> La campagne reste à <NuxtLink :to="`/campagnes/${data.slug}`">son adresse</NuxtLink>, même si le lien change.</template></p>
          <p class="btns"><NuxtLink class="btn btn--primary" :to="`/campagnes/${data.slug}/depot`">{{ data.phase === 'inscriptions' ? 'Déposer mon projet' : 'Voir mon dépôt' }}</NuxtLink></p>
          <p v-if="pasDeRetrait">{{ pasDeRetrait }}</p>
          <p v-else class="btns"><button class="btn" type="button" :aria-disabled="occupe" @click="agir('DELETE', 'Tu es désinscrit.')">Me désinscrire</button></p>
        </template>
        <p v-else-if="pourquoiPas">{{ pourquoiPas }}</p>
        <form v-else @submit.prevent="agir('POST', 'Tu es inscrit.')">
          <p><label><input v-model="connaissance" type="checkbox" required> Ton code sera envoyé à Anthropic avec la clé API de {{ data.boss_pseudo }}, sous son contrat Anthropic.</label></p>
          <p class="btns"><button class="btn btn--primary" type="submit" :aria-disabled="occupe">S'inscrire</button></p>
        </form>

        <h2>Brief</h2>
        <p class="brief">{{ data.brief }}</p>

        <h2>Règles</h2>
        <dl class="jauges">
          <div><dt>Langages admis</dt><dd>{{ data.langages.join(', ') }}</dd></div>
          <div><dt>Places restantes</dt><dd>{{ data.places_restantes }} sur {{ data.max_participants }}</dd></div>
          <div><dt>Ouverture des inscriptions</dt><dd>{{ dateParis(data.ouverture_inscriptions) }}</dd></div>
          <div><dt>Clôture des dépôts</dt><dd>{{ dateParis(data.cloture_depot) }}</dd></div>
          <div><dt>Résultats</dt><dd>{{ dateParis(data.date_resultats) }}</dd></div>
        </dl>
        <p class="note-claire">Heures de Paris. Inscriptions et dépôts sont ouverts ensemble, jusqu'à la clôture.</p>

        <h2>Critères et poids</h2>
        <ul class="criteres">
          <li v-for="c in data.criteres" :key="c.cle">
            <span>{{ c.libelle }} <span class="note-claire">({{ nomJure(c.jure) }}{{ c.calcule ? ', note calculée par un script' : '' }})</span></span>
            <span>{{ c.poids }}&nbsp;points</span>
          </li>
        </ul>
        <p v-if="data.role_boss === 'juge'">Le Boss vote&nbsp;: 33&nbsp;% du score final. Les quatre agents comptent pour les deux tiers restants.</p>
        <p v-else>Le Boss joue&nbsp;: les quatre agents notent seuls.</p>
      </template>
    </div>
  </section>
</template>
