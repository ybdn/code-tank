<script setup lang="ts">
import type { Jure } from '~/components/mascottes'

useHead({ title: 'Le concours de code jugé par ybdn et ses agents' })
useSeoMeta({
  description:
    'Un thème imposé, un zip à déposer, cinq jurés. Chaque note de ton rapport cite le fichier et la ligne qui la justifient.',
})

// Critères par défaut du jury (SPECS § 5) ; l'organisateur peut les changer par campagne.
const jures: { nom: string; jure: Jure; role: string; points: string }[] = [
  { nom: 'Sudo', jure: 'sudo', role: 'Sécurité, gestion des erreurs et cas limites', points: '25 points' },
  { nom: 'Refacto', jure: 'refacto', role: 'Structure, découpage, lisibilité et nommage', points: '25 points' },
  { nom: 'Le Boss', jure: 'boss', role: 'Le juré humain\u00a0: il lit ton code, ta présentation et ton README, et note sans voir les notes des quatre autres.', points: 'Un tiers du score' },
  { nom: 'Lint', jure: 'lint', role: "Tests, outillage et documentation. La note d'outillage et doc est calculée par un script, pas par les agents\u00a0; Lint la commente sans la modifier.", points: '25 points' },
  { nom: 'Pitch', jure: 'pitch', role: 'Réponse au brief, originalité et finition', points: '25 points' },
]

// Lue par le serveur (les brouillons sont cachés par la RLS) ; en cas d'erreur, `campagnes` reste vide.
const compteSupprime = useRoute().query.compte === 'supprime'
const { data: campagnes } = await useFetch('/api/campagnes', { retry: 0, key: 'campagnes' })
const ouverte = computed(() => campagnes.value?.find((c) => depotOuvert(c)))
const rebours = (iso: string) => {
  const j = joursAvant(iso)
  return j > 1 ? `J-${j}` : j === 1 ? 'Demain' : 'Aujourd\'hui'
}
</script>

<template>
  <div>
    <section class="section hero" aria-labelledby="hero-h">
      <div class="wrap hero__grille">
        <div class="hero__in">
          <p v-if="compteSupprime" role="status" class="avis">Ton compte est supprimé. Tes données personnelles sont effacées&nbsp;; seule reste, s'il y en a une, ta ligne anonyme d'un classement publié.</p>
          <InvitePrompt :commande="`$ code-tank ${ouverte ? `--campagne ${ouverte.slug}` : '--prochaine'}`">
            {{ ouverte ? `${ouverte.titre}\u00a0: dépôt ouvert jusqu'au ${formaterDate(ouverte.cloture_depot)}` : 'la prochaine campagne arrive' }}
          </InvitePrompt>
          <h1 id="hero-h">Ton code face au jury</h1>
          <p class="lead">
            Un thème par campagne. Tu déposes ton projet, ybdn et ses agents le notent, avec un retour détaillé en sécurité, architecture, tests et produit.
          </p>
          <p class="btns">
            <NuxtLink class="btn btn--primary" :to="ouverte ? `/campagnes/${ouverte.slug}` : '/compte'">{{ ouverte ? 'Voir la campagne ouverte' : 'Créer mon compte' }}</NuxtLink>
            <NuxtLink class="btn" to="/charte">Lire la charte</NuxtLink>
          </p>
        </div>
        <PlateauJury />
      </div>
    </section>

    <section id="campagnes" class="section" aria-labelledby="campagnes-h">
      <div class="wrap">
        <h2 id="campagnes-h">Campagnes</h2>
        <p v-if="!campagnes" class="vide">Les campagnes ne peuvent pas être lues pour le moment.</p>
        <p v-else-if="!campagnes.length" class="vide">Aucune campagne ouverte pour l'instant.</p>
        <ul v-else class="cartes">
          <li v-for="c in campagnes" :key="c.slug" class="carte">
            <p v-if="depotOuvert(c)" class="carte__rebours">{{ rebours(c.cloture_depot) }}</p>
            <h3><NuxtLink :to="`/campagnes/${c.slug}`">{{ c.titre }}</NuxtLink></h3>
            <p>Thème&nbsp;: {{ c.theme }}</p>
            <FriseEtapes :statut="c.statut" publique compacte />
            <p v-if="depotOuvert(c)" class="carte__dates">Dépôt jusqu'au {{ formaterDate(c.cloture_depot) }}</p>
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
            <code class="etapes__cmd" aria-hidden="true">$ code-tank login --github</code>
            <p>Connecte-toi avec GitHub et vérifie ton e-mail. L'organisateur autorise chaque compte à la main.</p>
          </li>
          <li>
            <h3>Dépose ton code</h3>
            <code class="etapes__cmd" aria-hidden="true">$ code-tank deposer projet.zip</code>
            <p>Une archive zip et une courte présentation. Le dépôt est contrôlé avant d'être lu, et jamais exécuté.</p>
          </li>
          <li>
            <h3>Reçois le verdict</h3>
            <code class="etapes__cmd" aria-hidden="true">$ code-tank verdict</code>
            <p>Un entretien avec le jury, tes notes par critère avec leurs preuves, et le classement final public.</p>
          </li>
        </ol>
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
        <p class="note">Critères et poids par défaut&nbsp;; ils sont publiés à l'ouverture de chaque campagne.</p>
      </div>
    </section>
  </div>
</template>
