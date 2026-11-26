<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const slug = route.params.slug as string
// L'API répond 404 à tout autre compte que le Boss, visiteur compris : la page aussi.
const { data, error, refresh } = await useFetch<CampagneBoss>(`/api/boss/${encodeURIComponent(slug)}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Page introuvable', fatal: true })
useHead({ title: () => data.value?.titre ?? 'Ma campagne' })

// Échue : date des résultats passée ; la base refuse alors toute action du Boss (campagne_vivante).
const echue = computed(() => !!data.value && Date.parse(data.value.date_resultats) < Date.now())
// Actions du Boss (réglage, suppression) : compte actif, campagne ni bloquée ni échue. La base revérifie tout.
const actif = computed(() => !!data.value && data.value.compte_actif && !data.value.bloquee_le && !echue.value)
// Réglable en brouillon ou ouverte, tant que les règles ne sont pas figées.
const reglable = computed(() => actif.value && ['brouillon', 'ouverte'].includes(data.value!.statut) && !data.value!.regles_figees_le)
// Ouvrable : brouillon d'un Boss actif, ni bloqué ni échu, dont la clôture des dépôts est à venir (sinon ouvrir_campagne refuse).
const clotureAVenir = computed(() => !!data.value && Date.parse(data.value.cloture_depot) > Date.now())
// Visible du public : ni brouillon, ni expirée, ni bloquée (vue campagne_phase).
const publiee = computed(() => !!data.value && !['brouillon', 'expiree'].includes(data.value.statut) && !data.value.bloquee_le)
// Pire cas de la délibération (story 4.2) et déjà dépensé par les lancements précédents (4.3) : relus quand le statut change
// (ouverture, lancement) et après un refus du lancement. Chargement et échec ont leur phrase.
// shortcut: montant lu à l'ouverture de la page, pas relu à la clôture des dépôts ni après un contrôle ; lancer_deliberation
// revérifie tout en SQL, et un refus (409) relit l'estimation.
const { data: estimation, status: etatEstimation, refresh: relireEstimation } = useFetch<{ disponible: true; pire_cas_usd: number; depense_usd: number } | { disponible: false; raison: string }>(
  `/api/boss/${encodeURIComponent(slug)}/estimation`, { lazy: true, watch: [() => data.value?.statut] })
const dollars = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(n)
const occupe = ref(false)
// Lancement (story 4.3) : plafond prérempli au pire cas (avec le déjà dépensé) arrondi au dollar supérieur. La clé reste dans ce champ
// seulement : jamais relue du serveur, effacée après le lancement.
const plafond = ref('')
const cle = ref('')
// La clé ne reste pas dans le champ quand le formulaire disparaît sans succès (clé déjà rangée par ailleurs).
watch(() => data.value?.cle_fin, (fin) => { if (fin) cle.value = '' })
const engagements = ref<boolean[]>(ENGAGEMENTS.map(() => false))
watch(estimation, (e) => {
  if (e?.disponible && !plafond.value) plafond.value = String(Math.ceil(e.pire_cas_usd + e.depense_usd))
}, { immediate: true })
const annonce = ref(route.query.cree ? 'Brouillon créé.' : '')
const alerte = ref('')
const titre = useTemplateRef<HTMLElement>('titre')
const zoneAlerte = useTemplateRef<HTMLElement>('zoneAlerte')
// Le paramètre est retiré après l'annonce : un rechargement ne la répète pas.
onMounted(() => {
  if (!route.query.cree) return
  titre.value?.focus()
  router.replace({ query: {} })
})

async function echec(e: unknown) {
  const err = e as { statusCode?: number; data?: { message?: string } }
  alerte.value = err.data?.message ?? 'Une erreur est survenue.'
  // Une règle a pu changer entre-temps (règles figées, blocage) : la page se remet à jour.
  if (err.statusCode === 409) await Promise.all([refresh(), relireEstimation()])
  await nextTick()
  zoneAlerte.value?.focus()
}

async function enregistrer(corps: Record<string, unknown>) {
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await $fetch(`/api/boss/${encodeURIComponent(slug)}`, { method: 'PATCH', body: corps })
    await refresh()
    annonce.value = 'Campagne enregistrée.'
  } catch (e) {
    await echec(e)
  } finally {
    occupe.value = false
  }
}

async function ouvrir() {
  if (occupe.value || !confirm('Ouvrir la campagne ? Elle devient visible et ne revient plus en brouillon.')) return
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await $fetch(`/api/boss/${encodeURIComponent(slug)}/ouverture`, { method: 'POST', body: {} })
    await refresh()
    annonce.value = 'Campagne ouverte.'
    // Le bouton a disparu : le focus revient au titre, l'annonce est lue par la zone role="status".
    await nextTick()
    titre.value?.focus()
  } catch (e) {
    await echec(e)
  } finally {
    occupe.value = false
  }
}

async function lancer() {
  // aria-disabled plutôt que disabled : le bouton garde le focus pendant l'envoi.
  if (occupe.value) return
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    const r = await $fetch<{ cle_fin: string }>(`/api/boss/${encodeURIComponent(slug)}/lancement`, {
      method: 'POST', body: { plafond_usd: Number(plafond.value), cle: cle.value.trim(), engagements: engagements.value, version: ENGAGEMENTS_VERSION },
    })
    cle.value = ''
    plafond.value = ''
    engagements.value = ENGAGEMENTS.map(() => false)
    await refresh()
    annonce.value = `Délibération lancée. Clé …${r.cle_fin}.`
    // Le formulaire a disparu : le focus revient au titre, l'annonce est lue par la zone role="status".
    await nextTick()
    titre.value?.focus()
  } catch (e) {
    await echec(e)
  } finally {
    occupe.value = false
  }
}

// Fin de la délibération (story 4.6) : en délibération sans clé, le Boss termine sans relancer ; la base revérifie tout.
async function terminer() {
  if (occupe.value || !confirm('Terminer la délibération ? Un dépôt dont un audit a échoué n\'aura pas de score. Tu ne pourras plus relancer.')) return
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await $fetch(`/api/boss/${encodeURIComponent(slug)}/fin`, { method: 'POST', body: {} })
    await refresh()
    annonce.value = 'Délibération terminée. Un dépôt dont un audit a échoué n\'a pas de score.'
    // Le bloc a disparu : le focus revient au titre, l'annonce est lue par la zone role="status".
    await nextTick()
    titre.value?.focus()
  } catch (e) {
    await echec(e)
  } finally {
    occupe.value = false
  }
}

// Lien d'invitation (story 2.4) : URL absolue à partir de l'origine de la requête, la même au rendu serveur et dans le navigateur.
const origine = useRequestURL().origin
const lien = computed(() => data.value?.jeton_invitation ? `${origine}/invitation/${data.value.jeton_invitation}` : '')
const annonceLien = ref('')
const titreLien = useTemplateRef<HTMLElement>('titreLien')

async function copier() {
  // Vidée puis remplie : un second clic redit l'annonce.
  annonceLien.value = ''
  await nextTick()
  try {
    await navigator.clipboard.writeText(lien.value)
    annonceLien.value = 'Lien copié.'
  } catch {
    annonceLien.value = 'La copie a échoué : sélectionne le lien et copie-le.'
  }
}

async function regenerer() {
  if (occupe.value || !confirm('Régénérer le lien ? L\'ancien n\'ouvrira plus rien.')) return
  occupe.value = true
  annonceLien.value = ''
  alerte.value = ''
  await nextTick()
  try {
    const r = await $fetch<{ jeton_invitation: string }>(`/api/boss/${encodeURIComponent(slug)}/invitation`, { method: 'POST', body: {} })
    // Le nouveau jeton vient de la réponse : pas de relecture qui pourrait échouer après une régénération réussie.
    data.value = { ...data.value!, jeton_invitation: r.jeton_invitation }
    annonceLien.value = 'Nouveau lien créé : l\'ancien n\'ouvre plus rien.'
    await nextTick()
    titreLien.value?.focus()
  } catch (e) {
    await echec(e)
  } finally {
    occupe.value = false
  }
}

async function supprimer() {
  // aria-disabled plutôt que disabled : le bouton garde le focus pendant l'envoi.
  if (occupe.value || !confirm('Supprimer ce brouillon ? Il disparaît pour de bon.')) return
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await $fetch(`/api/boss/${encodeURIComponent(slug)}`, { method: 'DELETE', body: {} })
    await navigateTo('/boss?supprime=1')
  } catch (e) {
    await echec(e)
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <section class="section">
    <div class="wrap texte texte--etroit">
      <p v-if="error" role="alert" class="avis avis--erreur">La campagne ne peut pas être lue pour le moment.</p>
      <template v-else-if="data">
        <h1 ref="titre" tabindex="-1">{{ data.titre }}</h1>
        <p class="etat etat--console" :data-etat="data.statut">{{ STATUT_BOSS[data.statut] }}<template v-if="data.bloquee_le"> · bloquée</template></p>
        <p role="status" aria-live="polite">{{ annonce }}</p>
        <div ref="zoneAlerte" tabindex="-1">
          <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
        </div>
        <p v-if="publiee" class="btns"><NuxtLink class="btn" :to="`/campagnes/${data.slug}`">Voir sa page publique</NuxtLink></p>
        <template v-if="lien">
          <h2 ref="titreLien" tabindex="-1">Lien d'invitation</h2>
          <p>Seuls ceux qui ont ce lien entrent dans la campagne.{{ data.statut === 'brouillon' ? ' Il y mène dès son ouverture.' : '' }}</p>
          <div class="champ"><label for="lien-invitation">Lien</label><input id="lien-invitation" type="text" readonly :value="lien"></div>
          <p class="btns"><button class="btn" type="button" @click="copier">Copier</button></p>
          <p role="status" aria-live="polite">{{ annonceLien }}</p>
          <template v-if="actif">
            <p>Le régénérer crée un nouveau lien&nbsp;: l'ancien n'ouvrira plus rien, les inscrits gardent leur accès.</p>
            <p class="btns"><button class="btn" type="button" :aria-disabled="occupe" @click="regenerer">Régénérer le lien</button></p>
          </template>
          <p v-else>Le lien ne se régénère plus&nbsp;: {{ !data.compte_actif ? 'ton compte n\'est pas actif.' : data.bloquee_le ? 'la campagne est bloquée.' : 'la date des résultats est passée.' }}</p>
        </template>
        <p v-if="data.role_boss === 'juge'">Tu juges cette campagne&nbsp;: ton vote compte pour 33&nbsp;% du score final.</p>
        <template v-if="data.statut === 'ouverte' || data.statut === 'deliberation'">
          <h2>Délibération</h2>
          <p v-if="data.cle_fin">Le jury délibère (clé …{{ data.cle_fin }}).</p>
          <template v-else>
            <p v-if="estimation?.disponible">Au pire, la délibération te coûtera <strong>{{ dollars(estimation.pire_cas_usd) }}</strong> sur ta clé Anthropic&nbsp;: chaque juré sur chaque dépôt, prix des lots, sans aucune lecture de cache. En pratique, le cache la rend moins chère.<template v-if="estimation.depense_usd > 0"> Tes lancements précédents ont déjà coûté {{ dollars(estimation.depense_usd) }}, compté dans ton plafond.</template></p>
            <p v-else-if="estimation">{{ estimation.raison }}</p>
            <p v-else-if="etatEstimation === 'error'" class="avis avis--erreur">Le pire cas ne peut pas être calculé pour le moment.</p>
            <p v-else>Calcul du pire cas…</p>
            <form v-if="estimation?.disponible && data.compte_actif" @submit.prevent="lancer">
              <div class="champ">
                <label for="plafond">Plafond de dépense, en dollars</label>
                <input id="plafond" v-model="plafond" type="number" min="1" :max="PLAFOND_MAX_USD" step="any" required inputmode="decimal" aria-describedby="aide-plafond">
                <p id="aide-plafond">Les agents ne dépensent jamais au-delà&nbsp;: il couvre au moins le pire cas{{ estimation.depense_usd > 0 ? ' et ce qui est déjà dépensé' : '' }}. Tu peux le relever à une relance.</p>
              </div>
              <div class="champ">
                <label for="cle">Ta clé API Anthropic (Console)</label>
                <input id="cle" v-model="cle" type="password" autocomplete="off" spellcheck="false" required aria-describedby="aide-cle">
                <p id="aide-cle">Elle commence par sk-ant-. Elle est rangée chiffrée, et seuls ses 4 derniers caractères te sont montrés.</p>
              </div>
              <div v-for="(texte, i) in ENGAGEMENTS" :key="i" class="champ champ--case">
                <input :id="`engagement-${i}`" v-model="engagements[i]" type="checkbox" required>
                <label :for="`engagement-${i}`">{{ texte }}</label>
              </div>
              <p class="btns"><button class="btn btn--primary" type="submit" :aria-disabled="occupe">Lancer la délibération</button></p>
            </form>
          </template>
        </template>
        <template v-if="data.statut === 'deliberation' && !data.cle_fin && actif">
          <h2>Terminer la délibération</h2>
          <p>La clé est effacée{{ data.lancements < 3 ? ` : tu peux relancer avec une nouvelle clé (lancements restants\u00a0: ${3 - data.lancements}), seuls les audits manquants ou en échec repartent` : ' et les trois lancements sont consommés' }}. Sinon, termine&nbsp;: un dépôt dont un audit a échoué n'aura pas de score, il ne sera ni classé ni noté zéro.</p>
          <p class="btns"><button class="btn" type="button" :aria-disabled="occupe" @click="terminer">Terminer la délibération</button></p>
        </template>
        <template v-if="data.statut === 'brouillon' && actif">
          <h2>Ouvrir la campagne</h2>
          <template v-if="clotureAVenir">
            <p>{{ data.visibilite === 'publique' ? 'Elle apparaît sur l\'accueil et chacun peut lire ses règles.' : 'Elle reste hors de l\'accueil : seuls ses invités la verront.' }}</p>
            <p class="btns"><button class="btn btn--primary" type="button" :aria-disabled="occupe" @click="ouvrir">Ouvrir la campagne</button></p>
          </template>
          <p v-else>La clôture des dépôts est passée&nbsp;: règle de nouvelles dates pour l'ouvrir.</p>
        </template>
        <FormulaireCampagne v-if="reglable" :initial="data" :occupe="occupe" @envoyer="enregistrer" />
        <p v-else-if="!data.compte_actif">Ton compte n'est pas actif.</p>
        <p v-else>Les réglages ne se modifient plus&nbsp;: {{ data.bloquee_le ? 'la campagne est bloquée.' : echue ? 'la date des résultats est passée.' : 'les règles sont figées à cette étape.' }}</p>
        <p v-if="data.compte_actif && brouillonEchu(data)" class="btns"><NuxtLink class="btn btn--primary" to="/boss">Créer une nouvelle campagne</NuxtLink></p>
        <template v-if="data.statut === 'brouillon' && actif">
          <h2>Supprimer le brouillon</h2>
          <p>Tu changes d'avis&nbsp;? Le brouillon disparaît pour de bon.</p>
          <p class="btns"><button class="btn btn--danger" type="button" :aria-disabled="occupe" @click="supprimer">Supprimer le brouillon</button></p>
        </template>
      </template>
    </div>
  </section>
</template>
