<script setup lang="ts">
const slug = String(useRoute().params.slug)
const campagne = await useCampagne(slug)
useHead({ title: campagne.value.titre })
const criteres = computed(() => campagne.value.criteres as Critere[])
const poidsMax = computed(() => Math.max(...criteres.value.map((c) => c.poids), 1))
const jours = computed(() => joursAvant(campagne.value.cloture_depot))
const ouverte = computed(() => ['inscriptions', 'depot'].includes(campagne.value.statut))
const enDeliberation = computed(() => STATUTS_DELIBERATION.includes(campagne.value.statut))
const resultatsPublies = computed(() => STATUTS_RESULTATS.includes(campagne.value.statut))

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const pret = ref(false)
const etatCompte = ref<string | null>(null)
const inscrit = ref(false)
const places = ref<number | null>(null)
const occupe = ref(false)
const confirmer = ref(false)
const message = ref('')
const alerte = ref('')

async function charger() {
  const id = campagne.value.id
  const { data: p } = await supabase.from('places_campagne').select('places_restantes').eq('campagne_id', id).maybeSingle()
  places.value = p?.places_restantes ?? null
  if (!user.value) {
    etatCompte.value = null
    inscrit.value = false
    return
  }
  const [compte, participation] = await Promise.all([
    supabase.from('compte').select('etat').eq('id', user.value.sub).maybeSingle(),
    supabase.from('participation').select('id').eq('campagne_id', id).eq('compte_id', user.value.sub).eq('etat', 'inscrit').maybeSingle(),
  ])
  etatCompte.value = compte.data?.etat ?? null
  inscrit.value = Boolean(participation.data)
}
// Délibération et résultats ont leur écran : ni places ni inscription à lire.
const avecInscription = computed(() => !enDeliberation.value && !resultatsPublies.value)
onMounted(async () => {
  if (avecInscription.value) await charger()
  pret.value = true
})
watch(user, async () => {
  if (pret.value && avecInscription.value) await charger()
})

async function sinscrire() {
  occupe.value = true
  message.value = alerte.value = ''
  // Le serveur applique la limite de débit, puis la fonction SQL contrôle tout (compte autorisé, statut, place restante).
  try {
    await $fetch(`/api/campagnes/${slug}/inscription`, { method: 'POST' })
    message.value = 'Inscription enregistrée.'
  } catch (e) {
    alerte.value = (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'L\'inscription a échoué. Réessaie dans un instant.'
  }
  occupe.value = false
  await charger()
}

async function sedesinscrire() {
  occupe.value = true
  message.value = alerte.value = ''
  try {
    await $fetch(`/api/campagnes/${slug}/inscription`, { method: 'DELETE' })
    message.value = 'Tu es désinscrit. Ton dépôt éventuel est supprimé.'
  } catch (e) {
    alerte.value = (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'La désinscription a échoué.'
  }
  confirmer.value = false
  occupe.value = false
  await charger()
}
</script>

<template>
  <CampagneDeliberation v-if="enDeliberation" :titre="campagne.titre" :theme="campagne.theme" />
  <CampagneClassement v-else-if="resultatsPublies" :campagne="campagne" />
  <section v-else class="section">
    <div class="wrap">
      <header class="campagne__tete">
        <FriseEtapes :statut="campagne.statut" publique />
        <h1>{{ campagne.titre }}</h1>
        <p class="lead">Thème imposé : {{ campagne.theme }}</p>
      </header>

      <div class="campagne__grille">
        <div class="campagne__corps">
          <h2>Le brief</h2>
          <!-- Texte saisi par l'organisateur : rendu comme du texte, jamais comme du HTML. -->
          <div class="terminal">
            <p class="terminal__barre" aria-hidden="true"><i /><i /><i /><span>brief.md</span></p>
            <p class="brief terminal__corps">{{ campagne.brief }}</p>
          </div>

          <h2>Les critères</h2>
          <ul class="criteres-jauges">
            <li v-for="c in criteres" :key="c.cle">
              <span>{{ c.libelle }}</span><strong>{{ c.poids }} %</strong>
              <JaugePixel :valeur="c.poids" :max="poidsMax" />
            </li>
          </ul>
          <p class="note-claire">Le Boss, juré humain, pèse un tiers du score final.</p>
        </div>

        <aside class="place" aria-labelledby="place-h">
          <h2 id="place-h">Ta place</h2>
          <p v-if="depotOuvert(campagne) && jours >= 0" class="place__rebours"><strong>{{ jours > 0 ? `J-${jours}` : 'Dernier jour' }}</strong> avant la clôture du dépôt</p>
          <dl class="place__dates">
            <div><dt>Inscriptions</dt><dd>{{ formaterDate(campagne.ouverture_inscriptions) }}</dd></div>
            <div><dt>Clôture du dépôt</dt><dd>{{ formaterDate(campagne.cloture_depot) }}</dd></div>
            <div><dt>Résultats</dt><dd>{{ formaterDate(campagne.date_resultats) }}</dd></div>
          </dl>
          <div v-if="places !== null" class="place__places">
            <p>{{ places }} place{{ places > 1 ? 's' : '' }} restante{{ places > 1 ? 's' : '' }} sur {{ campagne.max_participants }}</p>
            <JaugePixel :valeur="campagne.max_participants - places" :max="campagne.max_participants" />
          </div>
          <p v-else>{{ campagne.max_participants }} participants au maximum.</p>

          <div role="status" aria-live="polite"><p v-if="message" class="avis">{{ message }}</p></div>
          <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>

          <p v-if="!pret">Chargement…</p>
          <template v-else-if="!user">
            <p>Pour t'inscrire, connecte-toi avec GitHub et crée ton compte.</p>
            <p class="btns"><NuxtLink class="btn btn--primary" to="/compte">Se connecter</NuxtLink></p>
          </template>
          <template v-else-if="etatCompte !== 'autorise'">
            <p v-if="!etatCompte">Tu es connecté, mais ton compte n'est pas encore créé.</p>
            <p v-else>Ton compte doit être autorisé par l'organisateur avant que tu puisses t'inscrire.</p>
            <p class="btns"><NuxtLink class="btn" to="/compte">Voir mon compte</NuxtLink></p>
          </template>
          <template v-else-if="inscrit">
            <p>Tu es inscrit à cette campagne.</p>
            <p class="btns">
              <NuxtLink class="btn btn--primary" :to="`/campagnes/${slug}/depot`">{{ depotOuvert(campagne) ? 'Déposer mon code' : 'Voir mon dépôt' }}</NuxtLink>
              <button v-if="ouverte && !confirmer" class="btn" type="button" :disabled="occupe" @click="confirmer = true">Se désinscrire</button>
            </p>
            <div v-if="ouverte && confirmer" class="avis" role="group" aria-labelledby="confirmation-titre">
              <p id="confirmation-titre">Te désinscrire supprime aussi ton dépôt, s'il y en a un. Tu pourras t'inscrire de nouveau tant qu'il reste des places.</p>
              <p class="btns">
                <button class="btn btn--primary" type="button" :disabled="occupe" @click="sedesinscrire">Confirmer la désinscription</button>
                <button class="btn" type="button" :disabled="occupe" @click="confirmer = false">Annuler</button>
              </p>
            </div>
          </template>
          <template v-else-if="ouverte">
            <p v-if="places === 0">Cette campagne est complète.</p>
            <p v-else class="btns"><button class="btn btn--primary" type="button" :disabled="occupe" @click="sinscrire">S'inscrire</button></p>
          </template>
          <p v-else>Les inscriptions à cette campagne sont closes.</p>
        </aside>
      </div>
    </div>
  </section>
</template>
