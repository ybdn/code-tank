<script setup lang="ts">
// Jauge en cases, comme les mascottes : décorative, la valeur est toujours écrite à côté en toutes lettres.
const props = withDefaults(defineProps<{ valeur: number; max: number; cases?: number }>(), { cases: 20 })
const pleines = computed(() => (props.max > 0 ? Math.round((Math.min(props.valeur, props.max) / props.max) * props.cases) : 0))
</script>

<template>
  <span class="jauge" aria-hidden="true">
    <i v-for="n in cases" :key="n" :data-plein="n <= pleines ? '' : undefined" />
  </span>
</template>
