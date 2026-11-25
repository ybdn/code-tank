<script setup lang="ts">
// Lien d'invitation (story 2.4) : la fiche de la campagne, dont l'inscription envoie le jeton. Lien secret : jamais indexé.
// shortcut: la connexion GitHub revient toujours sur /compte ; l'invité rouvre le lien ensuite. À reprendre si un retour
// vers la page d'origine s'ajoute à useConnexionGithub.
const jeton = useRoute().params.jeton as string
useHead({ meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <FicheCampagne :url="`/api/invitation/${encodeURIComponent(jeton)}`" :jeton="jeton" />
</template>
