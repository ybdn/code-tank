<script setup lang="ts">
// Ni indexable ni lié depuis les pages publiques : le lien d'accès n'est affiché qu'à l'organisateur (app.vue).
useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>

<template>
  <div class="admin">
    <nav class="wrap admin__nav" aria-label="Administration">
      <NuxtLink to="/admin">Tableau de bord</NuxtLink>
      <NuxtLink to="/admin/comptes">Comptes</NuxtLink>
      <NuxtLink to="/admin/campagnes">Campagnes</NuxtLink>
      <NuxtLink to="/admin/reglages">Réglages</NuxtLink>
    </nav>
    <slot />
  </div>
</template>
