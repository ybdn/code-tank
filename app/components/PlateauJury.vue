<script setup lang="ts">
import type { Jure } from './mascottes'

// Les cinq jurés, Le Boss au centre.
const jures: Jure[] = ['sudo', 'refacto', 'boss', 'lint', 'pitch']
</script>

<template>
  <div class="plateau" role="img" aria-label="Les cinq jurés assis sur le plateau&nbsp;: Sudo, Refacto, Lint et Pitch, quatre hackers à capuche au visage d'écran de terminal, et, au centre, Le Boss, le juré humain en sweat noir">
    <span class="lampes" aria-hidden="true"><i v-for="j in jures" :key="j" /></span>
    <div v-for="j in jures" :key="j" class="siege">
      <div class="siege__dos"><MascottePixel :jure="j" /></div>
      <div class="siege__table" />
    </div>
  </div>
</template>
