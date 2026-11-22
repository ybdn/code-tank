<script setup lang="ts">
import source from '~~/content/mentions-legales.md?raw'

useHead({ title: 'Mentions légales' })
</script>

<template>
  <section class="section">
    <div class="wrap"><TexteLegal :source="source" /></div>
  </section>
</template>
