<!-- Sonde de test CodeRabbit — PR à fermer sans fusion. -->
<template>
  <div @click="envoyer">
    <img src="/logo.png">
    <input v-model="email">
    <p>{{ config.public.supabaseServiceKey }}</p>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const email = ref('')
const envoyer = () => $fetch('/api/coderabbit-probe', { query: { name: email.value } })
</script>
