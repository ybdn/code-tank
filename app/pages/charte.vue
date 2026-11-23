<script setup lang="ts">
import source from '~~/content/charte.md?raw'

useHead({ title: 'Charte' })
</script>

<template>
  <section class="section">
    <div class="wrap"><TexteLegal :source="source" /></div>
  </section>
</template>
