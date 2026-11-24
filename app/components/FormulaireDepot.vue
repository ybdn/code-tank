<script setup lang="ts">
// Formulaire de dépôt (SPECS § 4). Les contrôles d'ici sont une aide : le serveur et le bucket font foi.
const props = defineProps<{
  erreurs: ErreursDepot
  // Étape de l'envoi en cours (0 : aucune), annoncée aux technologies d'assistance.
  etape: number
  redepot: boolean
  // Valeur actuelle de la case de réutilisation, reprise pour qu'un nouveau dépôt ne la retire pas sans le dire.
  reutilisation: boolean
}>()
const emit = defineEmits<{ envoyer: [fichier: File, corps: Record<string, unknown>] }>()

// Recopié mot pour mot de SPECS § 9. Pas de case de consentement : l'envoi est fondé sur la charte.
const INFORMATION_CLAUDE = 'Ton code et ta présentation seront envoyés à l\'API Claude d\'Anthropic pour être analysés. Anthropic ne s\'en sert pas pour entraîner ses modèles et les efface sous 30 jours, sauf si son système de modération les signale comme contraires à sa politique d\'usage (conservation jusqu\'à 2 ans). Côté Code Tank, ton code est effacé 30 jours après la publication des résultats. Ne dépose aucun secret ni code confidentiel. Ton code doit être open source avec sa licence, ou déposé avec l\'accord écrit de son propriétaire (voir la charte). Pour exercer tes droits\u00a0: support@ybdn.io.'

const f = reactive({
  presentation: '',
  demande: '',
  type_code: '' as TypeCode | '',
  declaration_code: false,
  aucun_outil: false,
  outils: '',
  contact_reutilisation: props.reutilisation,
})
watch(() => props.reutilisation, (v) => { f.contact_reutilisation = v })
const ETAPES = ['', 'Vérification de ta déclaration', 'Envoi de l\'archive', 'Enregistrement du dépôt']
const fichier = ref<File | null>(null)
const locales = ref<ErreursDepot>({})
const toutes = computed<ErreursDepot>(() => ({ ...props.erreurs, ...locales.value }))
const nb = computed(() => Object.keys(toutes.value).length)
const formulaire = useTemplateRef<HTMLFormElement>('formulaire')

const corps = () => ({
  presentation: f.presentation,
  demande: f.demande,
  type_code: f.type_code,
  declaration_code: f.declaration_code,
  aucun_outil: f.aucun_outil,
  outils_ia: f.aucun_outil ? [] : listerOutils(f.outils),
  contact_reutilisation: f.contact_reutilisation,
})

async function soumettre() {
  const { erreurs } = validerDeclaration(corps())
  const erreurFichier = validerFichier(fichier.value)
  locales.value = { ...erreurs, ...(erreurFichier ? { fichier: erreurFichier } : {}) }
  if (nb.value) {
    await nextTick()
    formulaire.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  emit('envoyer', fichier.value!, corps())
}
// Les erreurs du serveur sont aussi amenées au premier champ fautif.
watch(() => props.erreurs, async () => {
  await nextTick()
  formulaire.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
})
const champ = (n: ChampDepot, aide?: string) => ({
  'aria-invalid': toutes.value[n] ? ('true' as const) : undefined,
  'aria-describedby': [aide, toutes.value[n] ? `err-${n}` : undefined].filter(Boolean).join(' ') || undefined,
})
</script>

<template>
  <form ref="formulaire" class="form" novalidate @submit.prevent="soumettre">
    <div role="status" aria-live="polite" class="form__resume">
      <p v-if="nb">{{ nb === 1 ? 'Un champ est à corriger.' : `${nb} champs sont à corriger.` }}</p>
    </div>

    <div class="champ">
      <label for="fichier">Archive .zip de ton projet</label>
      <p id="aide-fichier" class="champ__aide">20 Mo au plus. Le fichier part directement vers notre stockage privé.</p>
      <input
        id="fichier" type="file" accept=".zip,application/zip" required v-bind="champ('fichier', 'aide-fichier')"
        @change="fichier = ($event.target as HTMLInputElement).files?.[0] ?? null"
      >
      <p v-if="toutes.fichier" id="err-fichier" class="champ__erreur">{{ toutes.fichier }}</p>
    </div>

    <div class="champ">
      <label for="presentation">Présentation</label>
      <p id="aide-presentation" class="champ__aide">Ce que fait ton projet, ce dont tu es fier. 500 caractères au plus ({{ f.presentation.length }}/500).</p>
      <textarea id="presentation" v-model="f.presentation" rows="5" maxlength="500" required v-bind="champ('presentation', 'aide-presentation')" />
      <p v-if="toutes.presentation" id="err-presentation" class="champ__erreur">{{ toutes.presentation }}</p>
    </div>

    <div class="champ">
      <label for="demande">La demande (facultatif)</label>
      <p id="aide-demande" class="champ__aide">Ce que tu espères du jury, par exemple «&nbsp;Je vise 8/10, j'y ai passé trois nuits&nbsp;». Affichée avec ton entretien, sans effet sur la note. 80 caractères au plus.</p>
      <input id="demande" v-model="f.demande" type="text" maxlength="80" v-bind="champ('demande', 'aide-demande')">
      <p v-if="toutes.demande" id="err-demande" class="champ__erreur">{{ toutes.demande }}</p>
    </div>

    <fieldset class="champ groupe">
      <legend>Type de code</legend>
      <div class="champ champ--case">
        <input id="type-open" v-model="f.type_code" type="radio" name="type_code" value="open_source" required v-bind="champ('type_code')">
        <label for="type-open">Open source, avec son fichier LICENSE</label>
      </div>
      <div class="champ champ--case">
        <input id="type-prop" v-model="f.type_code" type="radio" name="type_code" value="proprietaire" required v-bind="champ('type_code')">
        <label for="type-prop">Propriétaire, déposé avec l'accord écrit de son propriétaire</label>
      </div>
      <p v-if="toutes.type_code" id="err-type_code" class="champ__erreur">{{ toutes.type_code }}</p>
    </fieldset>

    <fieldset class="champ groupe">
      <legend>Outils d'IA utilisés</legend>
      <p id="aide-outils" class="champ__aide">À déclarer à chaque dépôt. La déclaration n'a aucun effet sur la note.</p>
      <div class="champ">
        <label for="outils">Outils utilisés</label>
        <input
          id="outils" v-model="f.outils" type="text" maxlength="300" placeholder="Copilot, Cursor" :disabled="f.aucun_outil"
          v-bind="champ('outils_ia', 'aide-outils')"
        >
      </div>
      <div class="champ champ--case">
        <input id="aucun-outil" v-model="f.aucun_outil" type="checkbox" v-bind="champ('outils_ia', 'aide-outils')">
        <label for="aucun-outil">Aucun outil d'IA</label>
      </div>
      <p v-if="toutes.outils_ia" id="err-outils_ia" class="champ__erreur">{{ toutes.outils_ia }}</p>
    </fieldset>

    <div class="champ champ--case">
      <input id="declaration_code" v-model="f.declaration_code" type="checkbox" required v-bind="champ('declaration_code')">
      <label for="declaration_code">
        Je déclare que ce code est open source avec son fichier LICENSE, ou déposé avec l'accord écrit de son propriétaire
        (voir <NuxtLink to="/charte" target="_blank">la charte</NuxtLink>).
      </label>
      <p v-if="toutes.declaration_code" id="err-declaration_code" class="champ__erreur">{{ toutes.declaration_code }}</p>
    </div>

    <div class="champ champ--case">
      <input id="contact_reutilisation" v-model="f.contact_reutilisation" type="checkbox">
      <label for="contact_reutilisation">D'accord pour être contacté au sujet d'une réutilisation (facultatif).</label>
    </div>

    <p class="avis">{{ INFORMATION_CLAUDE }}</p>

    <div role="status" aria-live="polite">
      <template v-if="etape">
        <label for="avancement" class="champ__aide">Étape {{ etape }} sur 3&nbsp;: {{ ETAPES[etape] }}…</label>
        <progress id="avancement" class="avancement" max="3" :value="etape" />
      </template>
    </div>

    <p class="btns">
      <button class="btn btn--primary" type="submit" :disabled="etape > 0">{{ redepot ? 'Redéposer' : 'Déposer' }}</button>
    </p>
  </form>
</template>
