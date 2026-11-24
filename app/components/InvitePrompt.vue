<script setup lang="ts">
// Une ligne de terminal : l'invite et la commande sont décoratives, le texte qui suit est le message.
defineProps<{ commande: string }>()
</script>

<template>
  <p class="invite"><span aria-hidden="true">{{ commande }}&nbsp;</span><slot /><span class="invite__curseur" aria-hidden="true" /></p>
</template>
