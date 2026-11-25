<script setup lang="ts">
// Page publique d'une campagne (story 2.2). L'API répond 404 pour un brouillon, une campagne bloquée ou expirée, et une
// campagne sur invitation hors de son Boss : la page aussi.
const slug = useRoute().params.slug as string
const { data, error, refresh } = await useFetch(`/api/campagnes/${encodeURIComponent(slug)}`)
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
  if (c.visibilite === 'invitation') return 'Cette campagne se rejoint sur invitation.'
  if (c.phase !== 'inscriptions') return 'Les inscriptions ne sont pas ouvertes.'
  if (c.est_boss && c.role_boss === 'juge') return 'Tu juges cette campagne : tu ne t\'y inscris pas.'
  if (c.places_restantes <= 0) return 'La campagne est complète.'
  return ''
})
// Désinscription : tant que la délibération n'a pas commencé, compte actif, campagne non échue.
const desinscriptible = computed(() => !!data.value && data.value.inscrit && data.value.compte_actif
  && data.value.statut === 'ouverte' && Date.parse(data.value.date_resultats) > Date.now())
const connaissance = ref(false)
const occupe = ref(false)
const annonce = ref('')
const alerte = ref('')
const titreInscription = useTemplateRef<HTMLElement>('titreInscription')
const zoneAlerte = useTemplateRef<HTMLElement>('zoneAlerte')

async function agir(methode: 'POST' | 'DELETE', fait: string) {
  // aria-disabled plutôt que disabled : le bouton garde le focus pendant l'envoi.
  if (occupe.value) return
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await $fetch(`/api/campagnes/${encodeURIComponent(slug)}/inscription`, { method: methode, body: methode === 'POST' ? { connaissance: connaissance.value } : {} })
    await refresh()
    connaissance.value = false
    annonce.value = fait
    // Le bouton a disparu : le focus revient au titre de la section, l'annonce est lue par la zone role="status".
    await nextTick()
    titreInscription.value?.focus()
  } catch (e) {
    const err = e as { statusCode?: number; data?: { message?: string } }
    alerte.value = err.data?.message ?? 'Une erreur est survenue.'
    // Une règle a pu changer entre-temps (complet, phase) : la page se remet à jour sans démonter la section.
    if (err.statusCode === 409) await refresh()
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
      <p v-if="error" role="alert" class="avis avis--erreur">La campagne ne peut pas être lue pour le moment.</p>
      <template v-else-if="data">
        <h1>{{ data.titre }}</h1>
        <p class="etat etat--console">{{ LIBELLE_PHASE[data.phase] }}<template v-if="data.visibilite === 'invitation'"> · sur invitation</template></p>
        <p class="lead">{{ data.theme }}</p>
        <p>Campagne de {{ data.boss_pseudo }}, {{ data.role_boss === 'juge' ? 'qui la juge' : 'qui la joue avec vous' }}.</p>

        <h2 ref="titreInscription" tabindex="-1">Inscription</h2>
        <p role="status" aria-live="polite">{{ annonce }}</p>
        <div ref="zoneAlerte" tabindex="-1">
          <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
        </div>
        <template v-if="data.inscrit">
          <p>Tu es inscrit.</p>
          <p v-if="desinscriptible" class="btns"><button class="btn" type="button" :aria-disabled="occupe" @click="agir('DELETE', 'Tu es désinscrit.')">Me désinscrire</button></p>
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
