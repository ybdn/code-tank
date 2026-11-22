<script setup lang="ts">
import { ENCRE, MASCOTTES, type Jure } from './mascottes'

const props = defineProps<{ jure: Jure }>()

// Les pixels voisins de même couleur d'une rangée sont fusionnés en un seul rectangle.
const cases = computed(() => {
  const { palette, grille } = MASCOTTES[props.jure]
  const out: { x: number; y: number; w: number; fill: string }[] = []
  grille.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) {
      const ch = ligne[x]!
      if (ch === '.') continue
      const fill = ch === 'E' ? ENCRE : palette[ch]!
      const prec = out[out.length - 1]
      if (prec && prec.y === y && prec.x + prec.w === x && prec.fill === fill) prec.w++
      else out.push({ x, y, w: 1, fill })
    }
  })
  return out
})
</script>

<template>
  <svg class="mascotte" viewBox="0 0 14 14" shape-rendering="crispEdges" aria-hidden="true">
    <rect v-for="(c, i) in cases" :key="i" :x="c.x" :y="c.y" :width="c.w" height="1" :fill="c.fill" />
  </svg>
</template>
