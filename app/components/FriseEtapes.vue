<script setup lang="ts">
// Les étapes d'une campagne en cases : passées, en cours (accent), à venir. L'étape en cours est dite en texte.
// Les quatre étapes que voit un candidat. `compacte` : sans libellé sous chaque case (cartes étroites), l'étape en cours est écrite dessous.
const props = defineProps<{ statut: string; compacte?: boolean }>()
const nommees = computed(() => !props.compacte)
const etapes: readonly string[] = ETAPES_PUBLIQUES
const courant = computed(() => etapePublique(props.statut))
const rang = computed(() => etapes.indexOf(courant.value))
const libelle = (e: string) => LIBELLE_ETAPE_PUBLIQUE[e]
</script>

<template>
  <div class="frise" :data-publique="nommees ? '' : undefined">
    <ol aria-hidden="true">
      <li v-for="(e, i) in etapes" :key="e" :data-etat="i < rang ? 'fait' : i === rang ? 'courant' : undefined" :title="libelle(e)">
        <span v-if="nommees">{{ libelle(e) }}</span>
      </li>
    </ol>
    <p :class="{ 'sr-only': nommees }"><span class="sr-only">Étape </span>{{ rang + 1 }}/{{ etapes.length }} · {{ libelle(courant) }}</p>
  </div>
</template>
