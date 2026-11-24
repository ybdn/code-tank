<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const slug = String(useRoute().params.slug)
const { data, refresh } = await useLectureAdmin<DetailCampagne>(`/api/admin/campagnes/${slug}`)
const campagne = computed(() => data.value.campagne)
useHead({ title: campagne.value.titre })

const suite = computed(() => etapeSuivante(campagne.value.statut))
const figees = computed(() => campagne.value.regles_figees_le !== null)
const inscrits = computed(() => data.value.participations)
const deposes = computed(() => inscrits.value.filter((p) => p.depot).length)
const panneaux = computed(() => [
  { id: 'etape', titre: campagne.value.statut === 'brouillon' ? 'Étape' : 'Étape et jury' },
  { id: 'participants', titre: 'Participants', nb: inscrits.value.length },
  { id: 'depots', titre: 'Dépôts et vote du Boss', nb: deposes.value },
  { id: 'modifier', titre: 'Modifier la campagne' },
])
const ajoutables = computed(() => data.value.candidats.filter((c) => !inscrits.value.some((p) => p.compte_id === c.id)))

const statut = useAction()
const edition = useAction()
const ajout = useAction()
const jury = useAction()
const confirmerEtape = ref(false)
const aAjouter = ref('')

async function avancer() {
  const r = await statut.lancer(
    () => $fetch<{ courriels?: { envoyes: number; echecs: number; sansAdresseVerifiee: number } | null }>(`/api/admin/campagnes/${slug}/statut`, { method: 'POST', body: { statut: suite.value } }),
    `Campagne passée à « ${STATUT_ADMIN[suite.value!]} ».`,
  )
  confirmerEtape.value = false
  const c = r?.courriels
  if (c) {
    statut.message.value += ` E-mails de résultat : ${c.envoyes} envoyé${c.envoyes > 1 ? 's' : ''}, ${c.echecs} échec${c.echecs > 1 ? 's' : ''}, ${c.sansAdresseVerifiee} participant${c.sansAdresseVerifiee > 1 ? 's' : ''} sans adresse vérifiée. Il n'y a pas de bouton de renvoi : il créerait des doublons.`
  } else if (r?.courriels === null) {
    statut.message.value += ' Les destinataires des e-mails de résultat n\'ont pas pu être lus : aucun e-mail n\'est parti, et il n\'y a pas de bouton de renvoi.'
  }
  if (r) await refresh()
}
const MESSAGES_JURY: Record<string, string> = {
  lance: 'Jury lancé : il traite les dépôts reçus et les audits en cours.',
  deja_en_cours: 'Le jury travaille déjà : rien à relancer pour l\'instant.',
  non_configure: 'Le jury n\'est pas configuré sur ce site : l\'appel n\'a pas eu lieu.',
  echec: 'Le jury n\'a pas répondu : réessaie dans un instant.',
}
async function relancerJury() {
  const r = await jury.lancer(() => $fetch<{ etat: string }>(`/api/admin/campagnes/${slug}/jury`, { method: 'POST' }), '')
  if (r) jury.message.value = MESSAGES_JURY[r.etat] ?? MESSAGES_JURY.echec!
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
      <h1>{{ campagne.titre }}</h1>
      <FriseEtapes :statut="campagne.statut" />
      <p class="lead">Thème : {{ campagne.theme }}</p>
      <p v-if="campagne.statut !== 'brouillon'"><NuxtLink :to="`/campagnes/${campagne.slug}`">Voir la page publique</NuxtLink></p>

      <PanneauxAdmin :panneaux="panneaux" libelle="Sections de la campagne">
        <template #etape>
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

          <template v-if="campagne.statut !== 'brouillon'">
            <h2>Jury</h2>
            <p class="note-claire">Les dépôts reçus sont traités à chaque envoi, et le jury se réveille chaque jour. Ce bouton le relance tout de suite (une fois par minute au plus).</p>
            <div role="status" aria-live="polite"><p v-if="jury.message.value" class="avis">{{ jury.message.value }}</p></div>
            <p v-if="jury.alerte.value" role="alert" class="avis avis--erreur">{{ jury.alerte.value }}</p>
            <p class="btns"><button class="btn" type="button" :disabled="jury.occupe.value" @click="relancerJury">Relancer le jury</button></p>
          </template>
        </template>
        <template #participants>
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
        </template>
        <template #depots>
          <h2>Dépôts et vote du Boss</h2>
          <p class="note-claire">Aucun dépôt n'est exécuté, par personne : on lit, on ne lance rien.</p>
          <p v-if="!inscrits.length" class="note-claire">Aucune participation.</p>
          <ParticipationAdmin v-for="p in inscrits" :key="p.id" :participation="p" :campagne="campagne" @change="refresh()" />
        </template>
        <template #modifier>
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
        </template>
      </PanneauxAdmin>
    </div>
  </section>
</template>
