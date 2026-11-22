<script setup lang="ts">
import { Marked, Renderer } from 'marked'

const props = defineProps<{ source: string }>()

// Les .md sont des fichiers du dépôt, pas une saisie d'utilisateur : le HTML brut qu'ils contiennent est de confiance.
const base = new Renderer()
const marked = new Marked({
  renderer: {
    heading({ tokens, depth }) {
      const texte = this.parser.parseInline(tokens)
      const n = depth === 2 ? /^(\d+)\./.exec(tokens.map((t) => t.raw).join(''))?.[1] : undefined
      return `<h${depth}${n ? ` id="a${n}"` : ''}>${texte}</h${depth}>\n`
    },
    table(token) {
      const legende = token.header.map((c) => c.text).join(', ')
      return `<div class="tbl" role="region" tabindex="0" aria-label="Tableau : ${legende.replace(/"/g, '&quot;')}">${base.table.call(this, token)}</div>`
    },
  },
})

// Les notes de rédaction sont du travail interne, jamais publiées.
const texte = props.source.split(/^## Notes de rédaction/m)[0] ?? ''
const tokens = marked.lexer(texte)
const titre = marked.parser(tokens.slice(0, 1))
const html = marked.parser(tokens.slice(1))
const sommaire = tokens
  .flatMap((t) => (t.type === 'heading' && t.depth === 2 ? [t.text] : []))
  .flatMap((t) => {
    const n = /^(\d+)\./.exec(t)?.[1]
    return n ? [{ n, t }] : []
  })
</script>

<template>
  <article class="legal">
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-html="titre" />
    <nav v-if="sommaire.length > 1" class="toc" aria-label="Sommaire">
      <ul>
        <li v-for="s in sommaire" :key="s.n"><a :href="`#a${s.n}`">{{ s.t }}</a></li>
      </ul>
    </nav>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-html="html" />
  </article>
</template>
