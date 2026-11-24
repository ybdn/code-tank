<script setup lang="ts">
useHead({ title: 'Mon compte' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

type Etat = 'email_a_verifier' | 'verifie' | 'liste_attente' | 'autorise' | 'refuse' | 'ferme'
type Compte = Profil & { email_verifie_le: string | null; etat: Etat }

const ETATS: Record<Etat, string> = {
  email_a_verifier: 'Vérifie ton e-mail : ton compte attend le clic sur le lien que nous t\'avons envoyé.',
  verifie: 'En attente d\'autorisation : ton e-mail est vérifié, l\'organisateur autorise chaque compte à la main.',
  liste_attente: 'Liste d\'attente : le nombre de comptes est atteint. L\'organisateur choisit qui monte, ce n\'est pas l\'ordre d\'arrivée.',
  autorise: 'Compte autorisé : tu pourras t\'inscrire à une campagne dès qu\'une sera ouverte.',
  refuse: 'Ta candidature n\'a pas été retenue.',
  ferme: 'Ton compte est fermé.',
}
const pret = ref(false)
const compte = ref<Compte | null>(null)
// Le parcours d'un candidat, du premier clic à l'autorisation : fait, en cours (la première étape non faite), à venir.
const parcours = computed(() => {
  const faits = [Boolean(user.value), Boolean(compte.value), Boolean(compte.value?.email_verifie_le), compte.value?.etat === 'autorise']
  const courant = faits.indexOf(false)
  return ['Connexion GitHub', 'Profil', 'E-mail vérifié', 'Compte autorisé'].map((libelle, i) => ({ libelle, etat: faits[i] ? 'fait' : i === courant ? 'courant' : undefined }))
})
const bloque = computed(() => compte.value?.etat === 'refuse' || compte.value?.etat === 'ferme')
const occupe = ref(false)
const erreurs = ref<ErreursProfil>({})
const message = ref('')
const alerte = ref('')

async function charger() {
  const { data, error } = await supabase
    .from('compte')
    .select('vrai_nom, pseudo, email_contact, motivation, depot_cite_url, email_verifie_le, etat')
    // Le sien seulement : l'organisateur lit tous les comptes (RLS), maybeSingle échouerait sur plusieurs lignes.
    .eq('id', user.value!.sub)
    .maybeSingle()
  if (error) alerte.value = 'Impossible de lire ton compte pour le moment.'
  compte.value = data as Compte | null
  // Dernière connexion, pour la conservation : la base n'écrit qu'une fois par jour.
  if (data) await supabase.rpc('noter_connexion')
}

onMounted(async () => {
  if (user.value) await charger()
  pret.value = true
})
watch(user, async (u) => {
  if (!pret.value) return
  if (u) await charger()
  else compte.value = null
})

async function connecter() {
  // Le fournisseur GitHub est configuré sans scope supplémentaire : identité et e-mail seulement.
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${window.location.origin}/compte` },
  })
  if (error) alerte.value = 'La connexion avec GitHub a échoué. Réessaie dans un instant.'
}

async function deconnecter() {
  await supabase.auth.signOut()
  compte.value = null
  message.value = ''
}

async function appeler(methode: 'POST' | 'PATCH', chemin: string, corps?: Record<string, unknown>) {
  occupe.value = true
  erreurs.value = {}
  message.value = ''
  alerte.value = ''
  try {
    return await $fetch<{ courrielEnvoye?: boolean | null }>(chemin, { method: methode, body: corps })
  } catch (e) {
    const err = e as { data?: { statusMessage?: string; data?: { erreurs?: ErreursProfil } } }
    erreurs.value = err.data?.data?.erreurs ?? {}
    if (!Object.keys(erreurs.value).length) alerte.value = err.data?.statusMessage ?? 'Une erreur est survenue.'
    return null
  } finally {
    occupe.value = false
  }
}

async function creer(corps: Record<string, unknown>) {
  const r = await appeler('POST', '/api/compte', corps)
  if (!r) return
  await charger()
  message.value = r.courrielEnvoye
    ? 'Compte créé. Nous venons de t\'envoyer un lien de vérification.'
    : 'Compte créé, mais l\'e-mail n\'a pas pu partir : utilise « Renvoyer le lien ».'
}

async function modifier(corps: Record<string, unknown>) {
  const r = await appeler('PATCH', '/api/compte', corps)
  if (!r) return
  await charger()
  message.value = r.courrielEnvoye === null
    ? 'Profil enregistré.'
    : r.courrielEnvoye
      ? 'Profil enregistré. Ton adresse a changé : un nouveau lien de vérification est parti.'
      : 'Profil enregistré, mais l\'e-mail n\'a pas pu partir : utilise « Renvoyer le lien ».'
}

async function confirmerAttente() {
  occupe.value = true
  message.value = alerte.value = ''
  const { error } = await supabase.rpc('confirmer_attente')
  occupe.value = false
  if (error) alerte.value = error.code === 'P0001' ? error.message : 'La confirmation a échoué. Réessaie dans un instant.'
  else message.value = 'Merci, c\'est noté : ta candidature reste sur la liste d\'attente.'
}

async function renvoyer() {
  if (await appeler('POST', '/api/compte/verification')) message.value = 'Lien renvoyé. Il est valable 24 heures.'
}
</script>

<template>
  <section class="section">
    <div class="wrap texte">
      <h1>Mon compte</h1>
      <ol v-if="!bloque" class="parcours" aria-label="Ton parcours">
        <li v-for="(e, i) in parcours" :key="e.libelle" :data-etat="e.etat" :aria-current="e.etat === 'courant' ? 'step' : undefined">
          <span class="parcours__num" aria-hidden="true">{{ e.etat === 'fait' ? '✓' : String(i + 1).padStart(2, '0') }}</span>
          <span>{{ e.libelle }}<span v-if="e.etat === 'fait'" class="sr-only"> : fait</span></span>
        </li>
      </ol>

      <div role="status" aria-live="polite">
        <p v-if="message" class="avis">{{ message }}</p>
      </div>
      <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>

      <template v-if="!user">
        <p class="lead">
          Pour candidater, connecte-toi avec GitHub. Nous ne demandons que ton identité et ton e-mail, jamais l'accès à tes
          dépôts. Ensuite tu remplis ton profil, tu vérifies ton e-mail, puis l'organisateur autorise ton compte.
        </p>
        <p class="btns"><button class="btn btn--primary" type="button" :disabled="!pret" @click="connecter">Se connecter avec GitHub</button></p>
        <p v-if="!pret" class="note-claire">Le bouton s'active dès que la page est chargée.</p>
      </template>

      <p v-else-if="!pret">Chargement de ton compte…</p>

      <template v-else-if="!compte">
        <p class="lead">Tu es connecté avec GitHub. Crée ton compte : le profil, la charte et ta majorité.</p>
        <FormulaireProfil creation :erreurs="erreurs" :occupe="occupe" @envoyer="creer" />
        <p class="btns"><button class="btn" type="button" @click="deconnecter">Se déconnecter</button></p>
      </template>

      <template v-else-if="compte.etat === 'refuse' || compte.etat === 'ferme'">
        <h2>État</h2>
        <p class="etat etat--console" :data-etat="compte.etat">{{ ETATS[compte.etat] }}</p>
        <p>
          Pour exercer tes droits sur tes données :
          <a href="mailto:support@ybdn.io?subject=Code%20Tank%20%E2%80%94%20Mes%20donn%C3%A9es">support@ybdn.io</a>.
        </p>
        <p class="btns"><button class="btn" type="button" @click="deconnecter">Se déconnecter</button></p>
        <SuppressionCompte :pseudo="compte.pseudo" />
      </template>

      <template v-else>
        <h2>État</h2>
        <p class="etat etat--console" :data-etat="compte.etat">{{ ETATS[compte.etat] }}</p>
        <template v-if="compte.etat === 'liste_attente'">
          <p>Tous les 12 mois, nous te demandons par e-mail si tu attends toujours une place. Tu peux le confirmer ici, à tout moment.</p>
          <p class="btns"><button class="btn btn--primary" type="button" :disabled="occupe" @click="confirmerAttente">Je suis toujours en attente</button></p>
        </template>
        <p>
          E-mail de contact : <strong>{{ compte.email_contact }}</strong>
          ({{ compte.email_verifie_le ? 'vérifié' : 'pas encore vérifié' }}).
        </p>
        <p v-if="!compte.email_verifie_le" class="btns">
          <button class="btn" type="button" :disabled="occupe" @click="renvoyer">Renvoyer le lien</button>
        </p>

        <h2>Mon profil</h2>
        <FormulaireProfil
          :key="compte.email_contact + compte.pseudo"
          :creation="false"
          :initial="compte"
          :pseudo-fige="compte.etat === 'autorise'"
          :erreurs="erreurs"
          :occupe="occupe"
          @envoyer="modifier"
        />
        <p class="btns"><button class="btn" type="button" @click="deconnecter">Se déconnecter</button></p>
        <SuppressionCompte :pseudo="compte.pseudo" />
      </template>
    </div>
  </section>
</template>
