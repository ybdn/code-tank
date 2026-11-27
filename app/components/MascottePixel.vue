<script setup lang="ts">
import { MASCOTTES, type Jure } from './mascottes'

const props = defineProps<{ jure: Jure }>()

// Les pixels voisins de même couleur d'une rangée sont fusionnés en un seul rectangle.
// Les rangées au-delà de 24 (la couronne du Boss) montent au-dessus de la case et débordent.
const cases = computed(() => {
  const { palette, grille } = MASCOTTES[props.jure]
  const haut = grille.length - 24
  const out: { x: number; y: number; w: number; fill: string }[] = []
  grille.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) {
      const ch = ligne[x]!
      if (ch === '.') continue
      const fill = palette[ch]!
      const prec = out[out.length - 1]
      if (prec && prec.y === y - haut && prec.x + prec.w === x && prec.fill === fill) prec.w++
      else out.push({ x, y: y - haut, w: 1, fill })
    }
  })
  return out
})
</script>

<template>
  <svg class="mascotte" viewBox="0 0 24 24" overflow="visible" shape-rendering="crispEdges" aria-hidden="true">
    <rect v-for="(c, i) in cases" :key="i" :x="c.x" :y="c.y" :width="c.w" height="1" :fill="c.fill" />
  </svg>
</template>
