<script setup lang="ts">
import { GRILLES, TEINTES, type Jure } from './mascottes'

const props = defineProps<{ jure?: Jure; boss?: boolean }>()

const ENCRE = '#14100e'
type Case = { x: number; y: number; w: number; fill: string; curseur?: boolean }

// Lumière si le pixel du dessus est vide, ombre si celui du dessous ou de droite l'est ; les rangées de même teinte sont fusionnées.
const cases = computed<Case[]>(() => {
  if (!props.jure) return []
  const g = GRILLES[props.jure]
  const t = TEINTES[props.jure]
  const plein = (r: number, c: number) => (g[r]?.[c] ?? '.') !== '.'
  const out: Case[] = []
  g.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) {
      const ch = ligne[x]!
      if (ch === '.') continue
      const fill =
        ch === 'o' ? (!plein(y + 1, x) || !plein(y, x + 1) ? t.d : !plein(y - 1, x) ? t.l : t.o)
        : ch === 'h' ? '#ffffff' : ch === 'a' ? '#ff4a1f' : ENCRE
      const prec = out[out.length - 1]
      if (prec && prec.y === y && prec.x + prec.w === x && prec.fill === fill) prec.w++
      else out.push({ x, y, w: 1, fill, curseur: ch === 'a' })
    }
  })
  return out
})
</script>

<template>
  <svg class="mascotte" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
    <g v-if="boss" transform="translate(1 5)">
      <rect x="4" y="0" width="6" height="2" fill="#4b5059" /><rect x="3" y="1" width="1" height="1" fill="#4b5059" /><rect x="10" y="1" width="1" height="1" fill="#4b5059" />
      <rect x="4" y="2" width="6" height="4" fill="#d9a67a" /><rect x="5" y="3" width="1" height="1" fill="#14100e" /><rect x="8" y="3" width="1" height="1" fill="#14100e" />
      <rect x="4" y="4" width="1" height="2" fill="#3a2a1e" /><rect x="9" y="4" width="1" height="2" fill="#3a2a1e" /><rect x="5" y="5" width="4" height="1" fill="#3a2a1e" />
      <rect x="3" y="6" width="8" height="5" fill="#4b5059" /><rect x="2" y="7" width="1" height="2" fill="#4b5059" /><rect x="11" y="7" width="1" height="2" fill="#4b5059" />
      <rect x="2" y="9" width="1" height="2" fill="#d9a67a" /><rect x="11" y="9" width="1" height="2" fill="#d9a67a" />
    </g>
    <rect v-for="(c, i) in cases" :key="i" :class="{ curseur: c.curseur }" :x="c.x" :y="c.y" :width="c.w" height="1" :fill="c.fill" />
  </svg>
</template>
