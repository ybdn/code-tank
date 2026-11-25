<script setup lang="ts">
// Dépôt d'un inscrit (story 3.3) : l'état de sa réception et de son dépôt, le formulaire, le retrait. La page ne propose que
// l'action que deposer ou retirer_depot accepteront, sinon une phrase qui dit pourquoi ; la base revérifie tout.
const slug = useRoute().params.slug as string
const url = `/api/campagnes/${encodeURIComponent(slug)}`
type Page = CampagnePublique & { connecte: boolean; compte_actif: boolean; est_boss: boolean; inscrit: boolean; reception: ReceptionLue | null; depot: DepotLu | null }
const { data, error } = await useFetch<Page>(url)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Page introuvable', fatal: true })
useHead({ title: () => `Dépôt · ${data.value?.titre ?? 'Campagne'}` })

const enAttente = computed(() => data.value?.reception?.statut === 'en_attente')
const close = (c: Page) => Date.parse(c.cloture_depot) <= Date.now()
// Mêmes refus, dans le même ordre, que peut_deposer et deposer.
const pourquoiPas = computed(() => {
  const c = data.value
  if (!c) return ''
  if (!c.connecte) return 'Connecte-toi avec GitHub pour déposer.'
  if (!c.compte_actif) return 'Ton compte n\'est pas actif : tu ne peux pas déposer.'
  if (close(c)) return 'La date limite de dépôt est passée.'
  if (c.phase !== 'inscriptions') return 'Le dépôt n\'est pas ouvert.'
  if (c.est_boss && c.role_boss === 'juge') return 'Tu juges cette campagne : tu n\'y déposes pas.'
  if (!c.inscrit) return 'Inscris-toi à la campagne pour y déposer.'
  if (enAttente.value) return 'Ton dépôt précédent est en cours de contrôle : attends son résultat pour redéposer.'
  return ''
})
// Mêmes refus que retirer_depot.
const pasDeRetrait = computed(() => {
  const c = data.value
  if (!c?.depot) return ''
  if (!c.compte_actif) return 'Ton compte n\'est pas actif : tu ne peux pas retirer ton dépôt.'
  if (c.statut !== 'ouverte' || close(c)) return 'Le dépôt est clos : tu ne peux plus le retirer.'
  if (enAttente.value) return 'Ton dépôt est en cours de contrôle : attends son résultat pour le retirer.'
  return ''
})

const supabase = useSupabaseClient()
const occupe = ref(false)
const confirmer = ref(false)
const cle = ref(0) // change après un dépôt : le formulaire repart vide
const annonce = ref('')
const alerte = ref('')
const nonActualisee = ref(false)
const titreEtat = useTemplateRef<HTMLElement>('titreEtat')
const zoneAlerte = useTemplateRef<HTMLElement>('zoneAlerte')
const boutonAnnuler = useTemplateRef<HTMLButtonElement>('boutonAnnuler')
const boutonRetrait = useTemplateRef<HTMLButtonElement>('boutonRetrait')

// Relit la page sans toucher à ce qui est affiché en cas d'échec : une phrase et un bouton « Actualiser » le disent.
async function actualiser() {
  try {
    data.value = await $fetch<Page>(url)
    nonActualisee.value = false
  } catch {
    nonActualisee.value = true
  }
}

// Action terminée : annonce lue par la zone role="status", focus sur le titre de l'état. Refus : alerte et focus dessus ;
// une règle a pu changer entre-temps (409) : la page se remet à jour sans démonter le formulaire.
async function agir(action: () => Promise<void>, fait: string) {
  if (occupe.value) return
  occupe.value = true
  annonce.value = ''
  alerte.value = ''
  try {
    await action()
    await actualiser()
    confirmer.value = false
    annonce.value = fait
    await nextTick()
    titreEtat.value?.focus()
  } catch (e) {
    const err = e as { statusCode?: number; data?: { message?: string }; message?: string }
    alerte.value = err.data?.message ?? err.message ?? 'Une erreur est survenue.'
    if (err.statusCode === 409) await actualiser()
    await nextTick()
    zoneAlerte.value?.focus()
  } finally {
    occupe.value = false
  }
}

const deposer = (fichier: File, corps: { presentation: string; demande: string; droit: boolean }) => agir(async () => {
  // 1. Le site vérifie qu'on peut déposer et signe un envoi vers un chemin qu'il choisit.
  const { chemin, jeton } = await $fetch<{ chemin: string; jeton: string }>(`${url}/depot/url`, { method: 'POST', body: {} })
  // 2. L'archive part directement au bucket. Type fixé sur le fichier lui-même (l'envoi est un formulaire multipart, qui prend le
  // type du fichier) : un navigateur donne souvent un type vide ou autre à un zip, que le bucket refuserait.
  const { error: e } = await supabase.storage.from('depots').uploadToSignedUrl(chemin, jeton, fichier.slice(0, fichier.size, 'application/zip'), { contentType: 'application/zip' })
  if (e) throw new Error('Le stockage a refusé l\'archive : elle dépasse 20 Mo, n\'est pas un zip, ou l\'envoi a été interrompu. Réessaie.')
  // 3. deposer enregistre la réception, que le jury contrôlera.
  await $fetch<unknown>(`${url}/depot`, { method: 'POST', body: { chemin, ...corps } })
  cle.value++
}, 'Archive reçue : son contrôle est en cours.')

const retirer = () => agir(async () => { await $fetch<unknown>(`${url}/depot`, { method: 'DELETE', body: {} }) }, 'Dépôt retiré. Tu restes inscrit : tu peux redéposer avant la clôture.')

// Le bouton cliqué disparaît : le focus va sur « Annuler », choix sans risque, et revient sur « Retirer » à l'annulation.
async function demanderRetrait(v: boolean) {
  confirmer.value = v
  await nextTick()
  ;(v ? boutonAnnuler : boutonRetrait).value?.focus()
}
</script>

<template>
  <section class="section">
    <div class="wrap texte texte--etroit">
      <p v-if="error && !data" role="alert" class="avis avis--erreur">La campagne ne peut pas être lue pour le moment.</p>
      <template v-else-if="data">
        <p><NuxtLink :to="`/campagnes/${data.slug}`">← {{ data.titre }}</NuxtLink></p>
        <h1>Mon dépôt</h1>
        <p>Dépôts ouverts jusqu'au {{ dateParis(data.cloture_depot) }} (heure de Paris). Un nouveau dépôt remplace le précédent.</p>

        <h2 ref="titreEtat" tabindex="-1">État</h2>
        <p role="status" aria-live="polite">{{ annonce }}</p>
        <p v-if="nonActualisee">La page n'a pas pu être actualisée. <button class="btn" type="button" :aria-disabled="occupe" @click="agir(async () => {}, '')">Actualiser</button></p>
        <div ref="zoneAlerte" tabindex="-1">
          <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
        </div>

        <template v-if="data.reception">
          <!-- Le contrôle se termine sans que la page le sache : « Actualiser » relit l'état. -->
          <p v-if="data.reception.statut === 'en_attente'">
            Contrôle en cours de ton archive envoyée le {{ dateParis(data.reception.cree_le) }}.
            <button class="btn" type="button" :aria-disabled="occupe" @click="agir(async () => {}, 'État actualisé.')">Actualiser</button>
          </p>
          <template v-else>
            <p>Ton archive envoyée le {{ dateParis(data.reception.cree_le) }} a été refusée. Corrige ce qui suit, puis redépose.</p>
            <ul>
              <li v-for="(m, i) in data.reception.motifs ?? []" :key="i">{{ m.message ?? m.code }}</li>
            </ul>
          </template>
        </template>
        <template v-if="data.depot">
          <p>Ton dépôt accepté le {{ dateParis(data.depot.depose_le) }}&nbsp;:</p>
          <p class="brief">{{ data.depot.presentation }}</p>
          <p v-if="data.depot.demande">Ta demande&nbsp;: {{ data.depot.demande }}</p>
          <p v-if="pasDeRetrait">{{ pasDeRetrait }}</p>
          <p v-else-if="!confirmer" class="btns"><button ref="boutonRetrait" class="btn" type="button" :aria-disabled="occupe" @click="demanderRetrait(true)">Retirer mon dépôt</button></p>
          <div v-else class="avis" role="group" aria-labelledby="retrait-titre">
            <p id="retrait-titre">Ton dépôt et son archive seront supprimés. Tu resteras inscrit.</p>
            <p class="btns">
              <button class="btn btn--primary" type="button" :aria-disabled="occupe" @click="retirer">Confirmer le retrait</button>
              <button ref="boutonAnnuler" class="btn" type="button" :aria-disabled="occupe" @click="demanderRetrait(false)">Annuler</button>
            </p>
          </div>
        </template>
        <p v-if="!data.reception && !data.depot && data.inscrit">Tu n'as pas encore déposé.</p>

        <!-- Données périmées (actualisation échouée) : aucun formulaire, qui partirait sur un état faux. -->
        <template v-if="!nonActualisee">
          <template v-if="pourquoiPas">
            <p>{{ pourquoiPas }}</p>
            <p v-if="!data.connecte" class="btns"><NuxtLink class="btn btn--primary" to="/compte">Me connecter</NuxtLink></p>
          </template>
          <template v-else>
            <h2>{{ data.depot ? 'Redéposer' : 'Déposer' }}</h2>
            <FormulaireDepot :key="cle" :boss-pseudo="data.boss_pseudo" :occupe="occupe" :redepot="!!data.depot" @envoyer="deposer" />
          </template>
        </template>
      </template>
    </div>
  </section>
</template>
