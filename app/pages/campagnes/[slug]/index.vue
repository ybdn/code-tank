<script setup lang="ts">
// Page publique d'une campagne (story 2.2). L'API répond 404 pour un brouillon, une campagne bloquée ou expirée, et une
// campagne sur invitation hors de son Boss : la page aussi.
const slug = useRoute().params.slug as string
const { data, error } = await useFetch(`/api/campagnes/${encodeURIComponent(slug)}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Page introuvable', fatal: true })
useHead({ title: () => data.value?.titre ?? 'Campagne' })
const nomJure = (j: string) => j[0]!.toUpperCase() + j.slice(1)
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

        <h2>Brief</h2>
        <p class="brief">{{ data.brief }}</p>

        <h2>Règles</h2>
        <dl class="jauges">
          <div><dt>Langages admis</dt><dd>{{ data.langages.join(', ') }}</dd></div>
          <div><dt>Places</dt><dd>{{ data.max_participants }}</dd></div>
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
