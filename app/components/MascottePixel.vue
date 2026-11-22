<script setup lang="ts">
// Mascottes pixel originales ; la respiration (deux images) est dans main.css.
defineProps<{ couleur?: 'bleu' | 'or' | 'gris' | 'rose'; boss?: boolean }>()
</script>

<template>
  <svg class="mascotte" viewBox="0 0 14 11" shape-rendering="crispEdges" aria-hidden="true" :class="couleur && `c-${couleur}`">
    <template v-if="boss">
      <rect x="4" y="0" width="6" height="2" fill="#4b5059" /><rect x="3" y="1" width="1" height="1" fill="#4b5059" /><rect x="10" y="1" width="1" height="1" fill="#4b5059" />
      <rect x="4" y="2" width="6" height="4" fill="#d9a67a" /><rect x="5" y="3" width="1" height="1" fill="#14100e" /><rect x="8" y="3" width="1" height="1" fill="#14100e" />
      <rect x="4" y="4" width="1" height="2" fill="#3a2a1e" /><rect x="9" y="4" width="1" height="2" fill="#3a2a1e" /><rect x="5" y="5" width="4" height="1" fill="#3a2a1e" />
      <rect x="3" y="6" width="8" height="5" fill="#4b5059" /><rect x="2" y="7" width="1" height="2" fill="#4b5059" /><rect x="11" y="7" width="1" height="2" fill="#4b5059" />
      <rect x="2" y="9" width="1" height="2" fill="#d9a67a" /><rect x="11" y="9" width="1" height="2" fill="#d9a67a" />
    </template>
    <template v-else>
      <rect x="4" y="0" width="6" height="1" fill="currentColor" /><rect x="3" y="1" width="8" height="1" fill="currentColor" />
      <rect x="2" y="2" width="10" height="6" fill="#e07b4f" /><rect x="1" y="5" width="1" height="2" fill="#e07b4f" /><rect x="12" y="5" width="1" height="2" fill="#e07b4f" />
      <rect x="4" y="4" width="1" height="2" fill="#14100e" /><rect x="9" y="4" width="1" height="2" fill="#14100e" />
      <rect x="3" y="8" width="1" height="2" fill="#b85f3a" /><rect x="5" y="8" width="1" height="2" fill="#b85f3a" /><rect x="8" y="8" width="1" height="2" fill="#b85f3a" /><rect x="10" y="8" width="1" height="2" fill="#b85f3a" />
    </template>
  </svg>
</template>
