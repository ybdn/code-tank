<script setup lang="ts">
// Écran d'attente : aucune donnée de résultat n'est lue ici, pour que rien ne puisse s'afficher avant la publication.
defineProps<{ titre: string; theme: string }>()
</script>

<template>
  <section class="section" aria-labelledby="deliberation-h">
    <div class="wrap texte">
      <FriseEtapes statut="deliberation" publique />
      <h1 id="deliberation-h">{{ titre }}</h1>
      <p class="lead">Thème imposé : {{ theme }}</p>
      <InvitePrompt commande="$ jury --deliberer">Le jury délibère : il lit chaque projet.</InvitePrompt>
      <p>Le dépôt est clos. Les quatre jurés Claude lisent chaque projet ; Le Boss note de son côté, sans voir leurs notes. Rien n'est publié avant la fin de la délibération : ni notes, ni classement.</p>
      <PlateauJury />
      <p class="note-claire">Les résultats s'afficheront sur cette page. Si tu as participé, ton entretien et ton rapport t'y attendront, avec ton compte.</p>
    </div>
  </section>
</template>
