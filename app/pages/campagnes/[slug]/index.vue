<script setup lang="ts">
// Page publique d'une campagne (story 2.2) : sa fiche.
const slug = useRoute().params.slug as string
</script>

<template>
  <FicheCampagne :url="`/api/campagnes/${encodeURIComponent(slug)}`" />
</template>
