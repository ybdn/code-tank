<script setup lang="ts">
// Création et modification d'une campagne. Les contrôles d'ici sont une aide : le serveur et la base font foi.
const props = defineProps<{
  initial?: CampagneAdmin
  // Règles figées par le premier dépôt : brief, thème et critères ne se modifient plus.
  figees?: boolean
  // Le slug est l'adresse publique : il ne change plus une fois la campagne visible.
  slugFige?: boolean
  // Modèles des jurés : modifiables jusqu'à la délibération.
  modelesFiges?: boolean
  erreurs: Record<string, string>
  occupe: boolean
}>()
const emit = defineEmits<{ envoyer: [corps: CorpsCampagne] }>()

const i = props.initial
const f = reactive({
  slug: i?.slug ?? '',
  titre: i?.titre ?? '',
  theme: i?.theme ?? '',
  brief: i?.brief ?? '',
  criteres: structuredClone(toRaw(i?.criteres ?? CRITERES_PAR_DEFAUT)) as CritereAdmin[],
  ouverture_inscriptions: i ? versChampLocal(i.ouverture_inscriptions) : '',
  cloture_depot: i ? versChampLocal(i.cloture_depot) : '',
  date_resultats: i ? versChampLocal(i.date_resultats) : '',
  max_participants: (i?.max_participants ?? '') as number | '',
  modeles: { ...(i?.modeles ?? MODELES_PAR_DEFAUT) },
})
const locales = ref<ErreursCampagne>({})
const toutes = computed<Record<string, string | undefined>>(() => ({ ...props.erreurs, ...locales.value }))
const nb = computed(() => Object.values(toutes.value).filter(Boolean).length)
const total = computed(() => f.criteres.reduce((s, c) => s + (Number(c.poids) || 0), 0))
const formulaire = useTemplateRef<HTMLFormElement>('formulaire')

const corps = () => ({
  ...f,
  ouverture_inscriptions: depuisChampLocal(f.ouverture_inscriptions),
  cloture_depot: depuisChampLocal(f.cloture_depot),
  date_resultats: depuisChampLocal(f.date_resultats),
})

async function soumettre() {
  const { campagne, erreurs } = validerCampagne(corps())
  locales.value = erreurs
  if (Object.keys(erreurs).length) return focaliser()
  emit('envoyer', campagne)
}
// Premier champ fautif (la zone des critères porte data-invalide : une erreur de critère n'en désigne pas une cellule).
async function focaliser() {
  await nextTick()
  formulaire.value?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalide]')?.focus()
}
// Les erreurs du serveur sont aussi amenées au premier champ fautif.
watch(() => props.erreurs, focaliser)
const champ = (n: string, aide?: string) => ({
  'aria-invalid': toutes.value[n] ? ('true' as const) : undefined,
  'aria-describedby': [aide, toutes.value[n] ? `err-${n}` : undefined].filter(Boolean).join(' ') || undefined,
})
const descriptionCritere = computed(() => ['aide-criteres', toutes.value.criteres ? 'err-criteres' : ''].filter(Boolean).join(' '))
const retirer = (cle: string) => (f.criteres = f.criteres.filter((c) => c.cle !== cle))
</script>

<template>
  <form ref="formulaire" class="form form--large" novalidate @submit.prevent="soumettre">
    <div role="status" aria-live="polite" class="form__resume">
      <p v-if="nb">{{ nb === 1 ? 'Un champ est à corriger.' : `${nb} champs sont à corriger.` }}</p>
    </div>

    <div class="champ">
      <label for="slug">Slug</label>
      <p id="aide-slug" class="champ__aide">L'adresse publique&nbsp;: /campagnes/<em>slug</em>. Minuscules, chiffres et tirets.<template v-if="slugFige"> Figé&nbsp;: la campagne est visible.</template></p>
      <input id="slug" v-model="f.slug" type="text" maxlength="60" autocapitalize="none" spellcheck="false" :readonly="slugFige" required v-bind="champ('slug', 'aide-slug')">
      <p v-if="toutes.slug" id="err-slug" class="champ__erreur">{{ toutes.slug }}</p>
    </div>
    <div class="champ">
      <label for="titre">Titre</label>
      <input id="titre" v-model="f.titre" type="text" maxlength="120" required v-bind="champ('titre')">
      <p v-if="toutes.titre" id="err-titre" class="champ__erreur">{{ toutes.titre }}</p>
    </div>
    <div class="champ">
      <label for="theme">Thème imposé</label>
      <input id="theme" v-model="f.theme" type="text" maxlength="200" :readonly="figees" required v-bind="champ('theme')">
      <p v-if="toutes.theme" id="err-theme" class="champ__erreur">{{ toutes.theme }}</p>
    </div>
    <div class="champ">
      <label for="brief">Brief</label>
      <p id="aide-brief" class="champ__aide">Sujet, contraintes, langages admis. Affiché tel quel, sans mise en forme.<template v-if="figees"> Figé depuis le premier dépôt.</template></p>
      <textarea id="brief" v-model="f.brief" rows="8" maxlength="5000" :readonly="figees" required v-bind="champ('brief', 'aide-brief')" />
      <p v-if="toutes.brief" id="err-brief" class="champ__erreur">{{ toutes.brief }}</p>
    </div>

    <fieldset class="groupe">
      <legend>Critères</legend>
      <p id="aide-criteres" class="champ__aide">
        Les poids totalisent 100 avant l'ouverture des inscriptions. Le juré note ses critères, sauf celui marqué «&nbsp;calculé par script&nbsp;».
        <template v-if="figees">Figés depuis le premier dépôt.</template>
      </p>
      <div class="tableau" role="region" aria-label="Critères" tabindex="0" :data-invalide="toutes.criteres ? '' : undefined">
        <table>
          <thead>
            <tr><th scope="col">Clé</th><th scope="col">Libellé</th><th scope="col">Poids</th><th scope="col">Juré</th><th scope="col"><span class="sr-only">Action</span></th></tr>
          </thead>
          <tbody>
            <tr v-for="(c, n) in f.criteres" :key="c.cle">
              <th scope="row"><code>{{ c.cle }}</code><span v-if="c.calcule" class="note-claire"><br>calculé par script</span></th>
              <td>
                <label :for="`libelle-${n}`" class="sr-only">Libellé du critère {{ c.cle }}</label>
                <input :id="`libelle-${n}`" v-model="c.libelle" type="text" maxlength="100" :readonly="figees" required :aria-describedby="descriptionCritere">
              </td>
              <td>
                <label :for="`poids-${n}`" class="sr-only">Poids du critère {{ c.cle }}</label>
                <input :id="`poids-${n}`" v-model.number="c.poids" class="court" type="number" min="0" max="100" step="1" :readonly="figees" required :aria-describedby="descriptionCritere">
              </td>
              <td>
                <label :for="`jure-${n}`" class="sr-only">Juré du critère {{ c.cle }}</label>
                <select :id="`jure-${n}`" v-model="c.jure" :disabled="figees">
                  <option v-for="j in JURES" :key="j" :value="j">{{ NOM_JURE[j] }}</option>
                </select>
              </td>
              <td><button v-if="!figees && f.criteres.length > 1" class="btn" type="button" @click="retirer(c.cle)">Retirer <span class="sr-only">{{ c.cle }}</span></button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colspan="2">Total des poids</th>
              <td colspan="3" aria-live="polite">{{ total }} sur 100<template v-if="total !== 100">&nbsp;: à corriger avant l'ouverture des inscriptions</template></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-if="toutes.criteres" id="err-criteres" class="champ__erreur">{{ toutes.criteres }}</p>
    </fieldset>

    <div class="champ">
      <label for="ouverture_inscriptions">Ouverture des inscriptions</label>
      <p id="aide-ouverture" class="champ__aide">Heure de Paris.</p>
      <input id="ouverture_inscriptions" v-model="f.ouverture_inscriptions" type="datetime-local" required v-bind="champ('ouverture_inscriptions', 'aide-ouverture')">
      <p v-if="toutes.ouverture_inscriptions" id="err-ouverture_inscriptions" class="champ__erreur">{{ toutes.ouverture_inscriptions }}</p>
    </div>
    <div class="champ">
      <label for="cloture_depot">Clôture du dépôt</label>
      <input id="cloture_depot" v-model="f.cloture_depot" type="datetime-local" required v-bind="champ('cloture_depot')">
      <p v-if="toutes.cloture_depot" id="err-cloture_depot" class="champ__erreur">{{ toutes.cloture_depot }}</p>
    </div>
    <div class="champ">
      <label for="date_resultats">Date des résultats</label>
      <input id="date_resultats" v-model="f.date_resultats" type="datetime-local" required v-bind="champ('date_resultats')">
      <p v-if="toutes.date_resultats" id="err-date_resultats" class="champ__erreur">{{ toutes.date_resultats }}</p>
    </div>
    <div class="champ">
      <label for="max_participants">Nombre de participants</label>
      <p id="aide-max" class="champ__aide">Le quota des inscriptions directes. Tu peux ajouter deux participants de plus à la main.</p>
      <input id="max_participants" v-model.number="f.max_participants" type="number" min="1" max="1000" step="1" required v-bind="champ('max_participants', 'aide-max')">
      <p v-if="toutes.max_participants" id="err-max_participants" class="champ__erreur">{{ toutes.max_participants }}</p>
    </div>

    <fieldset class="groupe">
      <legend>Modèle de chaque juré</legend>
      <p id="aide-modeles" class="champ__aide">
        Le modèle Claude utilisé par les audits de ce juré&nbsp;: il décide du coût de la délibération.
        <template v-if="modelesFiges">Figé depuis le passage en délibération.</template>
      </p>
      <div v-for="j in JURES" :key="j" class="champ">
        <label :for="`modele-${j}`">{{ NOM_JURE[j] }}</label>
        <select :id="`modele-${j}`" v-model="f.modeles[j]" :disabled="modelesFiges" aria-describedby="aide-modeles">
          <option v-for="m in MODELES" :key="m" :value="m">{{ LIBELLE_MODELE[m] }}</option>
        </select>
      </div>
      <p v-if="toutes.modeles" id="err-modeles" class="champ__erreur">{{ toutes.modeles }}</p>
    </fieldset>

    <p class="btns"><button class="btn btn--primary" type="submit" :disabled="occupe">{{ occupe ? 'Enregistrement…' : initial ? 'Enregistrer la campagne' : 'Créer le brouillon' }}</button></p>
  </form>
</template>
