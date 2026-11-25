<script setup lang="ts">
import type { Jure } from '~/components/mascottes'

useHead({ title: 'Tu penses savoir coder\u00a0? Affronte notre jury.' })
useSeoMeta({
  description:
    'Un thème imposé, un zip à déposer, cinq jurés. Chaque note de ton rapport cite le fichier et la ligne qui la justifient.',
})

// Critères et poids du jury (SPECS § 5), les mêmes pour toute campagne.
const jures: { nom: string; jure: Jure; role: string; points: string }[] = [
  { nom: 'Sudo', jure: 'sudo', role: 'Sécurité, gestion des erreurs et cas limites', points: '25 points' },
  { nom: 'Refacto', jure: 'refacto', role: 'Structure, découpage, lisibilité et nommage', points: '25 points' },
  { nom: 'Le Boss', jure: 'boss', role: 'Le juré humain\u00a0: il lit ton code, ta présentation et ton README, et note sans voir les notes des quatre autres.', points: 'Un tiers du score' },
  { nom: 'Lint', jure: 'lint', role: "Tests, outillage et documentation. La note d'outillage et doc est calculée par un script, pas par les agents\u00a0; Lint la commente sans la modifier.", points: '25 points' },
  { nom: 'Pitch', jure: 'pitch', role: 'Réponse au brief, originalité et finition', points: '25 points' },
]

// Campagnes publiques ouvertes (story 2.2) : une base injoignable n'empêche pas l'accueil de s'afficher.
const { data: campagnes, error } = await useFetch('/api/campagnes')
</script>

<template>
  <div>
    <section class="section hero" aria-labelledby="hero-h">
      <div class="wrap hero__grille">
        <div class="hero__in">
          <InvitePrompt commande="$ code-tank --defi">lance ton défi, le jury tranche</InvitePrompt>
          <h1 id="hero-h">Tu penses savoir coder&nbsp;? Affronte notre jury.</h1>
          <p class="lead">
            Un thème, un projet déposé, quatre agents et un Boss qui notent ton code, avec un retour détaillé en sécurité, architecture, tests et produit.
          </p>
          <p class="btns">
            <NuxtLink class="btn btn--primary" to="/charte">Lire la charte</NuxtLink>
          </p>
        </div>
        <PlateauJury />
      </div>
    </section>

    <section class="section" aria-labelledby="campagnes-h">
      <div class="wrap">
        <h2 id="campagnes-h">Campagnes ouvertes</h2>
        <p v-if="error" role="alert" class="avis avis--erreur">Les campagnes ne peuvent pas être lues pour le moment.</p>
        <ul v-else-if="campagnes?.length" class="cartes">
          <li v-for="c in campagnes" :key="c.slug" class="carte">
            <h3><NuxtLink :to="`/campagnes/${c.slug}`">{{ c.titre }}</NuxtLink></h3>
            <p>{{ c.theme }}</p>
            <p>{{ LIBELLE_PHASE[c.phase] }} · {{ c.max_participants }} {{ c.max_participants > 1 ? 'places' : 'place' }}</p>
          </li>
        </ul>
        <p v-else>Aucune campagne ouverte pour le moment.</p>
      </div>
    </section>

    <section id="jury" class="section section--clair" aria-labelledby="jury-h">
      <div class="wrap">
        <h2 id="jury-h">Cinq jurés</h2>
        <ul class="jures">
          <li v-for="j in jures" :key="j.nom" :data-jure="j.jure">
            <div class="jures__tete"><MascottePixel :jure="j.jure" /></div>
            <span class="jures__nom">{{ j.nom }}</span>
            <span class="jures__val">{{ j.points }}</span>
            <p>{{ j.role }}</p>
          </li>
        </ul>
        <p class="note">Mêmes critères et mêmes poids pour toute campagne, publiés à son ouverture.</p>
      </div>
    </section>
  </div>
</template>
