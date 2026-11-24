<script setup lang="ts">
// Ni indexable ni lié depuis les pages publiques : le lien d'accès n'est affiché qu'à l'organisateur (app.vue).
useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const ONGLETS = [
  { to: '/admin', libelle: 'Tableau de bord', exact: true },
  { to: '/admin/comptes', libelle: 'Comptes' },
  { to: '/admin/campagnes', libelle: 'Campagnes' },
  { to: '/admin/reglages', libelle: 'Réglages' },
]
// En onglets défilants (écran étroit), l'onglet ouvert peut être hors de vue : on le centre.
const onglets = useTemplateRef<HTMLElement>('onglets')
function montrerActif() {
  const n = onglets.value
  const a = n?.querySelector<HTMLElement>('.actif')
  if (n && a && n.scrollWidth > n.clientWidth) n.scrollLeft += a.getBoundingClientRect().left - n.getBoundingClientRect().left - (n.clientWidth - a.offsetWidth) / 2
}
onMounted(montrerActif)
const route = useRoute()
watch(() => route.path, () => nextTick(montrerActif))
</script>

<template>
  <div class="admin">
    <div class="console">
      <div class="wrap console__bar">
        <p class="console__titre"><MascottePixel jure="boss" /><span>Console du Boss</span></p>
        <nav ref="onglets" class="console__onglets" aria-label="Administration">
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
