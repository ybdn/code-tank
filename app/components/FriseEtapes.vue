<script setup lang="ts">
// Les sept étapes d'une campagne en cases : passées, en cours (accent), à venir. L'étape en cours est dite en texte.
const props = defineProps<{ statut: string }>()
const rang = computed(() => ETAPES.indexOf(props.statut as Etape))
</script>

<template>
  <div class="frise">
    <ol aria-hidden="true">
      <li v-for="(e, i) in ETAPES" :key="e" :data-etat="i < rang ? 'fait' : i === rang ? 'courant' : undefined" :title="STATUT_ADMIN[e]" />
    </ol>
    <p><span class="sr-only">Étape </span>{{ rang + 1 }}/{{ ETAPES.length }} · {{ STATUT_ADMIN[statut] }}</p>
  </div>
</template>
