<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const slug = String(useRoute().params.slug)
const { data, refresh } = await useLectureAdmin<DetailCampagne>(`/api/admin/campagnes/${slug}`)
const campagne = computed(() => data.value.campagne)
useHead({ title: campagne.value.titre })

const suite = computed(() => etapeSuivante(campagne.value.statut))
const figees = computed(() => campagne.value.regles_figees_le !== null)
const inscrits = computed(() => data.value.participations)
const ajoutables = computed(() => data.value.candidats.filter((c) => !inscrits.value.some((p) => p.compte_id === c.id)))

const statut = useAction()
const edition = useAction()
const ajout = useAction()
const confirmerEtape = ref(false)
const aAjouter = ref('')

async function avancer() {
  const ok = await statut.lancer(() => $fetch(`/api/admin/campagnes/${slug}/statut`, { method: 'POST', body: { statut: suite.value } }), `Campagne passée à « ${STATUT_ADMIN[suite.value!]} ».`)
  confirmerEtape.value = false
  if (ok) await refresh()
}
async function enregistrer(corps: CorpsCampagne) {
  const r = await edition.lancer(() => $fetch<{ slug: string }>(`/api/admin/campagnes/${slug}`, { method: 'PATCH', body: corps }), 'Campagne enregistrée.')
  if (r) await refresh()
}
async function ajouter() {
  const ok = await ajout.lancer(() => $fetch(`/api/admin/campagnes/${slug}/participants`, { method: 'POST', body: { compte_id: aAjouter.value } }), 'Participant ajouté.')
  if (ok) {
    aAjouter.value = ''
    await refresh()
  }
}
</script>

<template>
  <section class="section">
    <div class="wrap">
      <p class="etat" :data-statut="campagne.statut">{{ STATUT_ADMIN[campagne.statut] }}</p>
      <h1>{{ campagne.titre }}</h1>
      <p class="lead">Thème : {{ campagne.theme }}</p>
      <p v-if="campagne.statut !== 'brouillon'"><NuxtLink :to="`/campagnes/${campagne.slug}`">Voir la page publique</NuxtLink></p>

      <h2>Étape</h2>
      <div role="status" aria-live="polite"><p v-if="statut.message.value" class="avis">{{ statut.message.value }}</p></div>
      <p v-if="statut.alerte.value" role="alert" class="avis avis--erreur">{{ statut.alerte.value }}</p>
      <p v-if="!suite">La campagne est archivée : il n'y a plus d'étape.</p>
      <template v-else>
        <p v-if="!confirmerEtape" class="btns">
          <button class="btn btn--primary" type="button" :disabled="statut.occupe.value" @click="confirmerEtape = true">Passer à « {{ STATUT_ADMIN[suite] }} »</button>
        </p>
        <div v-else class="avis" role="group" aria-labelledby="etape-titre">
          <p id="etape-titre"><strong>Passer à « {{ STATUT_ADMIN[suite] }} » ?</strong> {{ EFFET_ETAPE[suite] }} Cette étape ne se défait pas.</p>
          <p class="btns">
            <button class="btn btn--primary" type="button" :disabled="statut.occupe.value" @click="avancer">Confirmer</button>
            <button class="btn" type="button" :disabled="statut.occupe.value" @click="confirmerEtape = false">Annuler</button>
          </p>
        </div>
      </template>

      <h2>Participants ({{ inscrits.length }} sur {{ campagne.max_participants }})</h2>
      <p v-if="!inscrits.length" class="note-claire">Personne n'est inscrit.</p>
      <div v-else class="tableau" role="region" aria-label="Participants" tabindex="0">
        <table>
          <thead><tr><th scope="col">Pseudo</th><th scope="col">Vrai nom</th><th scope="col">Inscrit le</th></tr></thead>
          <tbody>
            <tr v-for="p in inscrits" :key="p.id"><th scope="row">{{ p.pseudo }}</th><td>{{ p.vrai_nom || '—' }}</td><td>{{ formaterDate(p.inscrit_le) }}</td></tr>
          </tbody>
        </table>
      </div>
      <form class="form" novalidate @submit.prevent="ajouter">
        <div role="status" aria-live="polite"><p v-if="ajout.message.value" class="avis">{{ ajout.message.value }}</p></div>
        <p v-if="ajout.alerte.value" role="alert" class="avis avis--erreur">{{ ajout.alerte.value }}</p>
        <div class="champ">
          <label for="ajout">Ajouter un participant hors quota</label>
          <p id="aide-ajout" class="champ__aide">Compte autorisé, jusqu'à deux places au-delà de {{ campagne.max_participants }}. Possible pendant les inscriptions et le dépôt.</p>
          <select id="ajout" v-model="aAjouter" aria-describedby="aide-ajout">
            <option value="" disabled>Choisir un compte autorisé…</option>
            <option v-for="c in ajoutables" :key="c.id" :value="c.id">{{ c.pseudo }} ({{ c.vrai_nom }})</option>
          </select>
        </div>
        <p class="btns"><button class="btn" type="submit" :disabled="ajout.occupe.value || !aAjouter">Ajouter</button></p>
      </form>

      <h2>Dépôts et vote du Boss</h2>
      <p class="note-claire">Aucun dépôt n'est exécuté, par personne : on lit, on ne lance rien.</p>
      <p v-if="!inscrits.length" class="note-claire">Aucune participation.</p>
      <ParticipationAdmin v-for="p in inscrits" :key="p.id" :participation="p" :campagne="campagne" @change="refresh()" />

      <h2>Modifier la campagne</h2>
      <p v-if="figees" class="avis">Le premier dépôt a figé le brief, le thème et les critères.</p>
      <div role="status" aria-live="polite"><p v-if="edition.message.value" class="avis">{{ edition.message.value }}</p></div>
      <p v-if="edition.alerte.value" role="alert" class="avis avis--erreur">{{ edition.alerte.value }}</p>
      <FormulaireCampagne
        :key="campagne.id"
        :initial="campagne"
        :figees="figees"
        :slug-fige="campagne.statut !== 'brouillon'"
        :erreurs="edition.erreurs.value"
        :occupe="edition.occupe.value"
        @envoyer="enregistrer"
      />
    </div>
  </section>
</template>
