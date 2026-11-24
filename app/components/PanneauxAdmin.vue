<script setup lang="ts">
// Une page d'administration découpée en panneaux : un menu latéral, un seul panneau visible. Le panneau ouvert est dans
// l'adresse (?panneau=…) : il se partage, survit au rechargement et marche sans JavaScript. v-show garde la saisie en cours.
const props = defineProps<{ panneaux: { id: string; titre: string; nb?: number; urgent?: boolean }[]; libelle: string }>()
const route = useRoute()
const actif = computed(() => {
  const q = route.query.panneau
  return props.panneaux.find((p) => p.id === q)?.id ?? props.panneaux[0]?.id
})
</script>

<template>
  <div class="panneaux">
    <nav class="panneaux__nav" :aria-label="libelle">
      <NuxtLink
        v-for="p in panneaux"
        :key="p.id"
        :to="{ query: { ...route.query, panneau: p.id } }"
        :aria-current="p.id === actif ? 'true' : undefined"
        replace
      >
        <span>{{ p.titre }}</span>
        <span v-if="p.nb !== undefined" class="panneaux__nb" :data-urgent="p.urgent && p.nb > 0 ? '' : undefined">{{ p.nb }}</span>
      </NuxtLink>
    </nav>
    <div class="panneaux__corps">
      <section v-for="p in panneaux" v-show="p.id === actif" :key="p.id" :aria-label="p.titre">
        <slot :name="p.id" />
      </section>
    </div>
  </div>
</template>
