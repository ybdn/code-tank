<script setup lang="ts">
const slug = String(useRoute().params.slug)
const campagne = await useCampagne(slug)
useHead({ title: `Dépôt · ${campagne.value.titre}` })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

type Motif = { code?: string; message?: string }
type Reception = { contact_reutilisation: boolean; etat: 'en_attente' | 'acceptee' | 'refusee'; motifs_refus: Motif[]; recue_le: string; traitee_le: string | null }
type Recu = { contact_reutilisation: boolean; sha256: string; taille_octets: number; nb_fichiers: number; fichiers_exclus: unknown[]; nb_tokens: number; depose_le: string }

const pret = ref(false)
const compteAutorise = ref(false)
const inscrit = ref(false)
const reception = ref<Reception | null>(null)
const recu = ref<Recu | null>(null)
const etape = ref(0)
const occupe = ref(false)
const confirmer = ref(false)
const cle = ref(0) // change après un dépôt : le formulaire repart vide
const erreurs = ref<ErreursDepot>({})
const message = ref('')
const alerte = ref('')
// Case de réutilisation : la dernière déclaration (celle de l'envoi en cours, sinon celle du dépôt accepté).
const accord = computed(() => reception.value?.contact_reutilisation ?? recu.value?.contact_reutilisation ?? false)
const peutRetirer = computed(() => ['inscriptions', 'depot'].includes(campagne.value.statut) && Boolean(reception.value || recu.value))

async function charger() {
  if (!user.value) return
  const id = user.value.sub
  const { data: compte } = await supabase.from('compte').select('etat').eq('id', id).maybeSingle()
  compteAutorise.value = compte?.etat === 'autorise'
  const { data: participation } = await supabase
    .from('participation').select('id').eq('campagne_id', campagne.value.id).eq('compte_id', id).eq('etat', 'inscrit').maybeSingle()
  inscrit.value = Boolean(participation)
  if (!participation) return
  const [r, d] = await Promise.all([
    supabase.from('ma_reception').select('etat, motifs_refus, recue_le, traitee_le, contact_reutilisation').eq('participation_id', participation.id).maybeSingle(),
    supabase.from('mon_depot').select('sha256, taille_octets, nb_fichiers, fichiers_exclus, nb_tokens, depose_le, contact_reutilisation').eq('participation_id', participation.id).maybeSingle(),
  ])
  reception.value = r.data as Reception | null
  recu.value = d.data as Recu | null
}
onMounted(async () => {
  await charger()
  pret.value = true
})
watch(user, async () => {
  if (pret.value) await charger()
})

const messageServeur = (e: unknown, defaut: string) => (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? defaut

async function deposer(fichier: File, corps: Record<string, unknown>) {
  erreurs.value = {}
  message.value = alerte.value = ''
  try {
    // 1. Le serveur contrôle qui dépose et la déclaration, puis délivre une URL d'envoi.
    etape.value = 1
    const { chemin, token } = await $fetch<{ chemin: string; token: string }>(`/api/campagnes/${slug}/depot/url`, { method: 'POST', body: corps })
    // 2. L'archive part directement au stockage, sans passer par le serveur. Le type est fixé : certains
    // systèmes envoient un zip sous un autre type, que le bucket refuserait.
    etape.value = 2
    const { error } = await supabase.storage.from('depots')
      .uploadToSignedUrl(chemin, token, fichier.slice(0, fichier.size, 'application/zip'), { contentType: 'application/zip' })
    if (error) {
      alerte.value = 'Le stockage a refusé l\'archive : elle dépasse 20 Mo, n\'est pas un zip, ou l\'envoi a été interrompu. Réessaie.'
      return
    }
    // 3. Le serveur enregistre la réception et efface l'ancienne archive.
    etape.value = 3
    await $fetch(`/api/campagnes/${slug}/depot`, { method: 'POST', body: { ...corps, chemin } })
    message.value = 'Archive reçue. Elle est maintenant en cours de contrôle.'
    await charger()
    cle.value++
  } catch (e) {
    erreurs.value = (e as { data?: { data?: { erreurs?: ErreursDepot } } }).data?.data?.erreurs ?? {}
    if (!Object.keys(erreurs.value).length) alerte.value = messageServeur(e, 'Le dépôt a échoué. Réessaie dans un instant.')
  } finally {
    etape.value = 0
  }
}

async function regler(e: Event) {
  const champ = e.target as HTMLInputElement
  const voulu = champ.checked
  occupe.value = true
  message.value = alerte.value = ''
  const { error } = await supabase.rpc('regler_contact_reutilisation', { p_campagne_id: campagne.value.id, p_accord: voulu })
  occupe.value = false
  if (error) {
    champ.checked = !voulu
    alerte.value = error.code === 'P0001' ? error.message : 'Le réglage n\'a pas pu être enregistré. Réessaie dans un instant.'
    return
  }
  message.value = voulu ? 'Noté : l\'organisateur pourra te contacter au sujet d\'une réutilisation.' : 'Noté : l\'organisateur ne te contactera pas au sujet d\'une réutilisation.'
  await charger()
}

async function retirer() {
  occupe.value = true
  message.value = alerte.value = ''
  try {
    await $fetch(`/api/campagnes/${slug}/depot`, { method: 'DELETE' })
    message.value = 'Dépôt retiré. Tu es toujours inscrit : tu peux redéposer avant la clôture.'
  } catch (e) {
    alerte.value = messageServeur(e, 'Le retrait a échoué.')
  }
  confirmer.value = false
  occupe.value = false
  await charger()
}
</script>

<template>
  <section class="section">
    <div class="wrap texte">
      <p><NuxtLink class="retour" :to="`/campagnes/${slug}`">← {{ campagne.titre }}</NuxtLink></p>
      <h1>Mon dépôt</h1>
      <InvitePrompt v-if="depotOuvert(campagne)" commande="$ code-tank deposer">dépôt ouvert jusqu'au {{ formaterDate(campagne.cloture_depot) }}</InvitePrompt>

      <div role="status" aria-live="polite"><p v-if="message" class="avis">{{ message }}</p></div>
      <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>

      <p v-if="!pret">Chargement…</p>
      <template v-else-if="!user">
        <p>Connecte-toi avec GitHub pour déposer ton code.</p>
        <p class="btns"><NuxtLink class="btn btn--primary" to="/compte">Se connecter</NuxtLink></p>
      </template>
      <template v-else-if="!compteAutorise || !inscrit">
        <p v-if="!compteAutorise">Ton compte doit être créé et autorisé par l'organisateur pour déposer du code.</p>
        <p v-else>Tu n'es pas inscrit à cette campagne.</p>
        <p class="btns"><NuxtLink class="btn btn--primary" :to="compteAutorise ? `/campagnes/${slug}` : '/compte'">{{ compteAutorise ? 'S\'inscrire' : 'Voir mon compte' }}</NuxtLink></p>
      </template>

      <template v-else>
        <template v-if="reception">
          <h2>État de ta réception</h2>
          <div class="terminal" :data-etat="reception.etat">
            <p class="terminal__barre" aria-hidden="true"><i /><i /><i /><span>reception.log</span></p>
            <div class="terminal__corps">
              <p v-if="reception.etat === 'en_attente'" class="etat" data-etat="en_attente">
                Reçu, en cours de contrôle (envoyé le {{ formaterDate(reception.recue_le) }}).
              </p>
              <template v-else-if="reception.etat === 'refusee'">
                <p class="etat" data-etat="refusee">Ton archive a été refusée. Corrige ce qui suit, puis redépose.</p>
                <ul>
                  <li v-for="(m, i) in reception.motifs_refus" :key="i">{{ m.message }}</li>
                </ul>
              </template>
              <p v-else class="etat" data-etat="acceptee">Ton archive est acceptée. Voici ton reçu.</p>
            </div>
          </div>
        </template>

        <template v-if="recu">
          <h2>Reçu de ton dépôt accepté</h2>
          <div class="terminal">
            <p class="terminal__barre" aria-hidden="true"><i /><i /><i /><span>recu.txt</span></p>
            <dl class="dates terminal__corps">
              <div><dt>Fichiers retenus</dt><dd>{{ recu.nb_fichiers }}</dd></div>
              <div><dt>Fichiers exclus</dt><dd>{{ recu.fichiers_exclus.length }}</dd></div>
              <div><dt>Taille</dt><dd>{{ recu.nb_tokens.toLocaleString('fr-FR') }} tokens</dd></div>
              <div><dt>Empreinte SHA-256</dt><dd class="empreinte">{{ recu.sha256 }}</dd></div>
              <div><dt>Déposé le</dt><dd>{{ formaterDate(recu.depose_le) }}</dd></div>
            </dl>
          </div>
          <p v-if="reception && reception.etat !== 'acceptee'" class="note-claire">Ce reçu reste valable tant que ton nouvel envoi n'est pas accepté.</p>
        </template>

        <template v-if="reception || recu">
          <h2>Réutilisation de ton code</h2>
          <p>
            Participer ne donne aucun droit sur ton code : toute réutilisation passe par un accord écrit séparé. Cette case dit seulement
            si l'organisateur peut te contacter pour en parler. Tu peux la modifier à tout moment, même après la clôture ; elle n'a aucun effet sur ta note.
          </p>
          <div class="champ champ--case">
            <input id="reutilisation" type="checkbox" :checked="accord" :disabled="occupe || etape > 0" @change="regler">
            <label for="reutilisation">D'accord pour être contacté au sujet d'une réutilisation</label>
          </div>
        </template>

        <template v-if="depotOuvert(campagne)">
          <h2>{{ reception || recu ? 'Redéposer' : 'Déposer ton code' }}</h2>
          <p v-if="reception || recu">Un nouvel envoi remplace le précédent, jusqu'à la clôture le {{ formaterDate(campagne.cloture_depot) }}.</p>
          <FormulaireDepot :key="cle" :erreurs="erreurs" :etape="etape" :redepot="Boolean(reception || recu)" :reutilisation="accord" @envoyer="deposer" />
        </template>
        <p v-else>Le dépôt n'est pas ouvert pour cette campagne.</p>

        <template v-if="peutRetirer">
          <h2>Retirer mon dépôt</h2>
          <p v-if="!confirmer" class="btns"><button class="btn" type="button" :disabled="occupe || etape > 0" @click="confirmer = true">Retirer mon dépôt</button></p>
          <div v-else class="avis" role="group" aria-labelledby="retrait-titre">
            <p id="retrait-titre">Ton dépôt et son archive seront supprimés. Tu resteras inscrit.</p>
            <p class="btns">
              <button class="btn btn--primary" type="button" :disabled="occupe" @click="retirer">Confirmer le retrait</button>
              <button class="btn" type="button" :disabled="occupe" @click="confirmer = false">Annuler</button>
            </p>
          </div>
        </template>
      </template>
    </div>
  </section>
</template>
