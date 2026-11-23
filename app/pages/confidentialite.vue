<script setup lang="ts">
import source from '~~/content/politique-de-confidentialite.md?raw'

useHead({ title: 'Politique de confidentialité' })
</script>

<template>
  <section class="section">
    <div class="wrap"><TexteLegal :source="source" /></div>
  </section>
</template>
