<script setup lang="ts">
import type { Jure } from '~/components/mascottes'

useHead({ title: 'Le concours de code jugé par Claude' })
useSeoMeta({
  description:
    'Un thème imposé, un zip à déposer, cinq jurés. Chaque note de ton rapport cite le fichier et la ligne qui la justifient.',
})

// Critères par défaut du jury (SPECS § 5) ; l'organisateur peut les changer par campagne.
const jures: { nom: string; jure: Jure; role: string; points: string }[] = [
  { nom: 'Sudo', jure: 'sudo', role: 'Sécurité, gestion des erreurs et cas limites', points: '25 points' },
  { nom: 'Refacto', jure: 'refacto', role: 'Structure, découpage, lisibilité et nommage', points: '25 points' },
  { nom: 'Le Boss', jure: 'boss', role: 'Le juré humain : il lit ton code, ta présentation et ton README, et note sans voir les notes des quatre autres.', points: 'Un tiers du score' },
  { nom: 'Lint', jure: 'lint', role: "Tests, outillage et documentation. La note d'outillage et doc est calculée par un script, pas par Claude ; Lint la commente sans la modifier.", points: '25 points' },
  { nom: 'Pitch', jure: 'pitch', role: 'Réponse au brief, originalité et finition', points: '25 points' },
]

// Lue par le serveur (les brouillons sont cachés par la RLS) ; en cas d'erreur, `campagnes` reste vide.
const { data: campagnes } = await useFetch('/api/campagnes', { key: 'campagnes' })
</script>

<template>
  <div>
    <section class="section hero" aria-labelledby="hero-h">
      <div class="wrap hero__in">
        <h1 id="hero-h">Concours de code jugé par Claude</h1>
        <p class="lead">
          Un thème imposé, le même pour tous. Tu déposes ton projet, cinq jurés le notent, et chaque note cite le
          fichier et la ligne qui la justifient.
        </p>
        <p class="btns">
          <NuxtLink class="btn btn--primary" to="/compte">Créer mon compte</NuxtLink>
          <NuxtLink class="btn" to="/charte">Lire la charte</NuxtLink>
        </p>
      </div>
    </section>

    <section id="campagnes" class="section" aria-labelledby="campagnes-h">
      <div class="wrap">
        <h2 id="campagnes-h">Campagnes</h2>
        <p v-if="!campagnes" class="vide">Les campagnes ne peuvent pas être lues pour le moment.</p>
        <p v-else-if="!campagnes.length" class="vide">Aucune campagne ouverte pour l'instant.</p>
        <ul v-else class="cartes">
          <li v-for="c in campagnes" :key="c.slug" class="carte">
            <p class="carte__statut">{{ LIBELLE_STATUT[c.statut] }}</p>
            <h3><NuxtLink :to="`/campagnes/${c.slug}`">{{ c.titre }}</NuxtLink></h3>
            <p>Thème : {{ c.theme }}</p>
            <p class="carte__dates">Dépôt jusqu'au {{ formaterDate(c.cloture_depot) }}</p>
          </li>
        </ul>
      </div>
    </section>

    <section id="etapes" class="section" aria-labelledby="etapes-h">
      <div class="wrap">
        <h2 id="etapes-h">Une campagne en trois étapes</h2>
        <ol class="etapes">
          <li>
            <h3>Crée ton compte</h3>
            <p>Connecte-toi avec GitHub et vérifie ton e-mail. L'organisateur autorise chaque compte à la main.</p>
          </li>
          <li>
            <h3>Dépose ton code</h3>
            <p>Une archive zip et une courte présentation. Le dépôt est contrôlé avant d'être lu, et jamais exécuté.</p>
          </li>
          <li>
            <h3>Reçois le verdict</h3>
            <p>Un entretien avec le jury, tes notes par critère avec leurs preuves, et le classement final public.</p>
          </li>
        </ol>
      </div>
    </section>

    <section id="jury" class="section section--clair" aria-labelledby="jury-h">
      <div class="wrap jury">
        <div>
          <h2 id="jury-h">Cinq jurés</h2>
          <ul class="rows">
            <li v-for="j in jures" :key="j.nom">
              <span class="rows__nom">{{ j.nom }}</span>
              <p>{{ j.role }}</p>
              <span class="rows__val">{{ j.points }}</span>
            </li>
          </ul>
          <p class="note">Critères et poids par défaut ; ils sont publiés à l'ouverture de chaque campagne.</p>
        </div>
        <div class="plateau" role="img" aria-label="Les cinq jurés assis sur le plateau : Sudo, Refacto, Lint et Pitch, quatre créatures coiffées chacune de leur chapeau, et, au centre, Le Boss, le juré humain en casquette">
          <span class="lampes" aria-hidden="true"><i v-for="j in jures" :key="j.nom" /></span>
          <div v-for="j in jures" :key="j.nom" class="siege">
            <div class="siege__dos"><MascottePixel :jure="j.jure" /></div>
            <div class="siege__table" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
