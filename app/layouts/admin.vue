<script setup lang="ts">
// Ni indexable ni lié depuis les pages publiques : le lien d'accès n'est affiché qu'à l'organisateur (app.vue).
useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const ONGLETS = [
  { to: '/admin', libelle: 'Tableau de bord', exact: true },
  { to: '/admin/comptes', libelle: 'Comptes' },
  { to: '/admin/campagnes', libelle: 'Campagnes' },
  { to: '/admin/reglages', libelle: 'Réglages' },
]
</script>

<template>
  <div class="admin">
    <div class="console">
      <div class="wrap console__bar">
        <p class="console__titre"><MascottePixel jure="boss" /><span>Console du Boss</span></p>
        <nav class="console__onglets" aria-label="Administration">
          <NuxtLink
            v-for="(o, i) in ONGLETS"
            :key="o.to"
            :to="o.to"
            :exact-active-class="o.exact ? 'actif' : undefined"
            :active-class="o.exact ? undefined : 'actif'"
          >
            <span class="console__num" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>{{ o.libelle }}
          </NuxtLink>
        </nav>
      </div>
    </div>
    <slot />
  </div>
</template>
