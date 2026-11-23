<script setup lang="ts">
// Aperçu du classement pour l'organisateur, avant la publication : le classement tel qu'il serait publié maintenant.
// Rafraîchi par la page (refreshNuxtData) après un vote, une décision ou un changement d'étape.
const props = defineProps<{ slug: string; criteres: CritereAdmin[] }>()

const { data, error, refresh, status } = await useFetch<LigneApercu[]>(`/api/admin/campagnes/${props.slug}/classement`, {
  retry: 0, key: `apercu-${props.slug}`,
})
const lignes = computed(() => data.value ?? [])
const nbClasses = computed(() => lignes.value.filter((l) => l.rang !== null).length)
const nbCaches = computed(() => lignes.value.filter((l) => !l.vote_verrouille).length)
const egalites = computed(() => egalitesSansDepartage(lignes.value))
</script>

<template>
  <div>
    <p class="note-claire">
      Le classement tel qu'il serait publié maintenant, calculé par la même règle que la page publique. Il n'est visible que de toi.
      Score final = deux tiers du score Claude (sur 100) + un tiers de la note du Boss (sur 10, ramenée sur 100).
    </p>
    <p class="btns"><button class="btn" type="button" :disabled="status === 'pending'" @click="refresh()">Recalculer</button></p>

    <p v-if="error" role="alert" class="avis avis--erreur">L'aperçu du classement ne peut pas être lu pour le moment. Réessaie dans un instant.</p>
    <p v-else-if="!lignes.length" class="note-claire">Aucun dépôt : rien à classer pour l'instant.</p>
    <template v-else>
      <ul>
        <li>{{ nbClasses }} classé{{ nbClasses > 1 ? 's' : '' }} sur {{ lignes.length }} dépôt{{ lignes.length > 1 ? 's' : '' }}.</li>
        <li v-if="nbCaches">
          {{ nbCaches }} vote{{ nbCaches > 1 ? 's' : '' }} du Boss non verrouillé{{ nbCaches > 1 ? 's' : '' }} : score Claude caché (vote à l'aveugle),
          et la publication sera refusée tant qu'il en reste.
        </li>
      </ul>
      <div v-if="egalites.length" class="avis" role="status">
        <p><strong>Égalité sans départage.</strong> Ces candidats partagent un rang ; une décision de départage, avec sa justification publique, place l'un devant :</p>
        <ul><li v-for="g in egalites" :key="g.join()">{{ g.join(', ') }}</li></ul>
      </div>

      <div class="tableau tableau--serre" role="region" aria-labelledby="apercu-legende" tabindex="0">
        <table>
          <caption id="apercu-legende" class="sr-only">Aperçu du classement</caption>
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
            <tr v-for="l in lignes" :key="l.participation_id">
              <td>{{ l.rang ?? '—' }}<span v-if="l.rang === null" class="sr-only"> non classé</span></td>
              <th scope="row">
                {{ l.pseudo }}
                <span v-if="motifNonClasse(l)" class="mention">{{ motifNonClasse(l) }}</span>
                <span v-if="l.disqualifie && l.justification" class="mention">Justification publique : {{ l.justification }}</span>
                <span v-if="l.justification_departage" class="mention">Départagé : {{ l.justification_departage }}</span>
              </th>
              <td>{{ formaterNombre(l.score_claude) }}</td>
              <td>{{ formaterNombre(l.note_boss) }}</td>
              <td><strong>{{ formaterNombre(l.score_final) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Notes par critère</h3>
      <p class="note-claire">Sur 10 ; le poids du critère entre parenthèses. Une ligne sans vote verrouillé reste vide.</p>
      <div class="tableau tableau--notes" role="region" aria-labelledby="apercu-notes" tabindex="0">
        <table>
          <caption id="apercu-notes" class="sr-only">Notes par critère, aperçu</caption>
          <thead>
            <tr>
              <th scope="col">Candidat</th>
              <th v-for="c in criteres" :key="c.cle" scope="col">{{ c.libelle }} ({{ c.poids }} %)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lignes" :key="l.participation_id">
              <th scope="row">{{ l.pseudo }}</th>
              <td v-for="c in criteres" :key="c.cle">{{ l.notes?.[c.cle] ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
