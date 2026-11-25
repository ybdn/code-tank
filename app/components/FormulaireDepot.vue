<script setup lang="ts">
// Formulaire de dépôt (story 3.3, SPECS § 4). Fichier, présentation et case sont contrôlés ici pour ne pas envoyer 20 Mo
// voués au refus, avec les messages de deposer, qui revérifie tout (la demande, bornée par maxlength, aussi).
const props = defineProps<{ bossPseudo: string; occupe: boolean; redepot: boolean }>()
const emit = defineEmits<{ envoyer: [fichier: File, corps: { presentation: string; demande: string; droit: boolean }] }>()

const fichier = ref<File | null>(null)
const presentation = ref('')
const demande = ref('')
const droit = ref(false)
const erreurs = ref({ fichier: '', presentation: '', droit: '' })
const formulaire = useTemplateRef<HTMLFormElement>('formulaire')

async function soumettre() {
  if (props.occupe) return
  erreurs.value = {
    fichier: validerFichier(fichier.value),
    presentation: presentation.value.trim() ? '' : 'La présentation fait entre 1 et 500 caractères.',
    droit: droit.value ? '' : 'Coche la case : tu dois avoir le droit de déposer ce code.',
  }
  if (Object.values(erreurs.value).some(Boolean)) {
    await nextTick()
    formulaire.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  emit('envoyer', fichier.value!, { presentation: presentation.value, demande: demande.value, droit: droit.value })
}
</script>

<template>
  <form ref="formulaire" class="form" novalidate @submit.prevent="soumettre">
    <div class="champ">
      <label for="fichier">Archive .zip de ton projet</label>
      <p id="aide-fichier" class="champ__aide">20 Mo au plus. Elle part directement vers notre stockage privé.</p>
      <input
        id="fichier" type="file" accept=".zip,application/zip" required
        :aria-invalid="erreurs.fichier ? 'true' : undefined" :aria-describedby="erreurs.fichier ? 'aide-fichier err-fichier' : 'aide-fichier'"
        @change="fichier = ($event.target as HTMLInputElement).files?.[0] ?? null"
      >
      <p v-if="erreurs.fichier" id="err-fichier" class="champ__erreur">{{ erreurs.fichier }}</p>
    </div>

    <div class="champ">
      <label for="presentation">Présentation</label>
      <p id="aide-presentation" class="champ__aide">Ce que fait ton projet, ce dont tu es fier. 500 caractères au plus ({{ presentation.length }}/500).</p>
      <textarea
        id="presentation" v-model="presentation" rows="5" maxlength="500" required
        :aria-invalid="erreurs.presentation ? 'true' : undefined" :aria-describedby="erreurs.presentation ? 'aide-presentation err-presentation' : 'aide-presentation'"
      />
      <p v-if="erreurs.presentation" id="err-presentation" class="champ__erreur">{{ erreurs.presentation }}</p>
    </div>

    <div class="champ">
      <label for="demande">La demande (facultatif)</label>
      <p id="aide-demande" class="champ__aide">Ce que tu espères du jury, par exemple «&nbsp;Je vise 8/10, j'y ai passé trois nuits&nbsp;». Affichée avec ton entretien, sans effet sur la note. 80 caractères au plus.</p>
      <input id="demande" v-model="demande" type="text" maxlength="80" aria-describedby="aide-demande">
    </div>

    <div class="champ champ--case">
      <input id="droit" v-model="droit" type="checkbox" required :aria-invalid="erreurs.droit ? 'true' : undefined" :aria-describedby="erreurs.droit ? 'err-droit' : undefined">
      <label for="droit">
        J'ai le droit de déposer ce code (il est à moi, sous licence libre, ou j'ai l'accord écrit de son propriétaire).
        Voir <NuxtLink to="/charte" target="_blank">la charte</NuxtLink>.
      </label>
      <p v-if="erreurs.droit" id="err-droit" class="champ__erreur">{{ erreurs.droit }}</p>
    </div>

    <!-- shortcut: la phrase sur ce qu'Anthropic fait des données et le nom de l'entité Anthropic (Ireland, Limited ou PBC) arrivent avec la story 8.2. -->
    <p class="avis">
      Ton code et ta présentation seront envoyés au compte Anthropic de {{ bossPseudo }}, avec sa clé API, pour l'audit du jury.
      Code Tank les efface 30 jours après la publication des résultats. Ne laisse dans ton archive aucun secret ni code
      confidentiel, et ne dépose que du code que tu as le droit de déposer (case ci-dessus). Pour exercer tes droits&nbsp;:
      <a href="mailto:support@ybdn.io">support@ybdn.io</a>.
    </p>

    <p class="btns">
      <button class="btn btn--primary" type="submit" :aria-disabled="occupe">{{ occupe ? 'Envoi en cours…' : redepot ? 'Redéposer' : 'Déposer' }}</button>
    </p>
  </form>
</template>
