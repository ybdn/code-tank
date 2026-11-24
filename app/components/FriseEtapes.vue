<script setup lang="ts">
// Les étapes d'une campagne en cases : passées, en cours (accent), à venir. L'étape en cours est dite en texte.
// `publique` : les quatre étapes que voit un candidat ; sinon les sept de l'administration.
// `compacte` : sans libellé sous chaque case (cartes étroites), l'étape en cours est écrite dessous.
const props = defineProps<{ statut: string; publique?: boolean; compacte?: boolean }>()
const nommees = computed(() => props.publique && !props.compacte)
const etapes = computed<readonly string[]>(() => (props.publique ? ETAPES_PUBLIQUES : ETAPES))
const courant = computed(() => (props.publique ? etapePublique(props.statut) : props.statut))
const rang = computed(() => etapes.value.indexOf(courant.value))
const libelle = (e: string) => (props.publique ? LIBELLE_ETAPE_PUBLIQUE[e] : STATUT_ADMIN[e])
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
