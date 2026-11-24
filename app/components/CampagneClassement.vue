<script setup lang="ts">
const props = defineProps<{ campagne: { slug: string; titre: string; theme: string; statut: string; criteres: Critere[] } }>()

const { data, error } = await useFetch<LigneClassement[]>(`/api/campagnes/${props.campagne.slug}/classement`, { retry: 0, key: `classement-${props.campagne.slug}` })
const lignes = computed(() => data.value ?? [])
const rang = computed(() => podium(lignes.value))

// Le classement est public ; seul le candidat connecté qui y figure reçoit le lien vers son entretien (les pseudos sont uniques).
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const pseudo = ref<string | null>(null)
async function chercherPseudo() {
  pseudo.value = user.value ? (await supabase.from('compte').select('pseudo').eq('id', user.value.sub).maybeSingle()).data?.pseudo ?? null : null
}
onMounted(chercherPseudo)
watch(user, chercherPseudo)
const figure = computed(() => pseudo.value !== null && lignes.value.some((l) => l.pseudo === pseudo.value))
</script>

<template>
  <section class="section" aria-labelledby="classement-h">
    <div class="wrap texte resultats">
      <FriseEtapes :statut="campagne.statut" publique />
      <h1 id="classement-h">{{ campagne.titre }}</h1>
      <p class="lead">Thème imposé : {{ campagne.theme }}</p>

      <p v-if="error" role="alert" class="avis avis--erreur">Le classement ne peut pas être lu pour le moment. Réessaie dans un instant.</p>
      <p v-else-if="!lignes.length" class="vide">Aucun dépôt n'a été classé dans cette campagne.</p>
      <template v-else>
        <p v-if="figure" class="btns"><NuxtLink class="btn btn--primary" :to="`/campagnes/${campagne.slug}/resultat`">Voir mon entretien et mon rapport</NuxtLink></p>

        <template v-if="rang.length">
          <h2 id="podium-h">Le podium</h2>
          <ol class="podium" aria-labelledby="podium-h">
            <li v-for="l in rang" :key="l.pseudo" :data-rang="l.rang">
              <span class="podium__rang">{{ ordinal(l.rang!) }}</span>
              <strong class="podium__nom">{{ l.pseudo }}</strong>
              <span>{{ formaterNombre(l.score_final) }} sur 100</span>
              <JaugePixel :valeur="l.score_final ?? 0" :max="100" />
            </li>
          </ol>
        </template>

        <h2>Le classement final</h2>
        <p class="note-claire">Score final = deux tiers du score Claude (sur 100) + un tiers de la note du Boss (sur 10, ramenée sur 100).</p>
        <div class="tableau tableau--serre" role="region" aria-labelledby="legende-classement" tabindex="0">
          <table>
            <caption id="legende-classement" class="sr-only">Classement final de {{ campagne.titre }}</caption>
            <thead>
              <tr>
                <th scope="col">Rang</th>
                <th scope="col">Candidat</th>
                <th scope="col">Score Claude</th>
                <th scope="col">Note du Boss</th>
                <th scope="col">Score final</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lignes" :key="l.pseudo">
                <td>{{ l.rang ?? '—' }}<span v-if="l.rang === null" class="sr-only"> non classé</span></td>
                <th scope="row">
                  {{ l.pseudo }}
                  <span v-if="l.disqualifie" class="mention">Disqualifié. Justification publique de l'organisateur : {{ l.justification }}</span>
                  <span v-else-if="l.rang === null" class="mention">Non classé.</span>
                  <span v-if="l.justification_departage" class="mention">Départagé à égalité par l'organisateur : {{ l.justification_departage }}</span>
                </th>
                <td>{{ formaterNombre(l.score_claude) }}</td>
                <td>{{ formaterNombre(l.note_boss) }}</td>
                <td><strong>{{ formaterNombre(l.score_final) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Les notes par critère</h2>
        <p class="note-claire">Chaque note est sur 10 ; le poids du critère est indiqué entre parenthèses. Le tableau défile sur les petits écrans.</p>
        <div class="tableau tableau--notes" role="region" aria-labelledby="legende-notes" tabindex="0">
          <table>
            <caption id="legende-notes" class="sr-only">Notes sur 10 par critère de {{ campagne.titre }}</caption>
            <thead>
              <tr>
                <th scope="col">Candidat</th>
                <th v-for="c in campagne.criteres" :key="c.cle" scope="col">{{ c.libelle }} ({{ c.poids }} %)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lignes" :key="l.pseudo">
                <th scope="row">{{ l.pseudo }}</th>
                <td v-for="c in campagne.criteres" :key="c.cle">{{ l.notes?.[c.cle] ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </section>
</template>
