<script setup lang="ts">
// Création et réglage d'une campagne (story 2.1). Les contraintes des champs sont une aide : creer_campagne et
// modifier_campagne font foi et renvoient un message clair (affiché par la page). Critères, poids et modèle ne se règlent pas.
const props = defineProps<{ initial?: CampagneBoss; occupe: boolean }>()
const emit = defineEmits<{ envoyer: [corps: Record<string, unknown>] }>()

const i = props.initial
const f = reactive({
  titre: i?.titre ?? '',
  theme: i?.theme ?? '',
  brief: i?.brief ?? '',
  langages: i?.langages.join(', ') ?? '',
  visibilite: i?.visibilite ?? 'publique',
  role_boss: i?.role_boss ?? 'juge',
  max_participants: i?.max_participants ?? 10,
  ouverture_inscriptions: i ? versChampLocal(i.ouverture_inscriptions) : '',
  cloture_depot: i ? versChampLocal(i.cloture_depot) : '',
  date_resultats: i ? versChampLocal(i.date_resultats) : '',
})

function soumettre() {
  // aria-disabled plutôt que disabled : le bouton garde le focus pendant l'envoi.
  if (props.occupe) return
  emit('envoyer', {
    ...f,
    langages: f.langages.split(',').map((l) => l.trim()).filter(Boolean),
    ouverture_inscriptions: depuisChampLocal(f.ouverture_inscriptions),
    cloture_depot: depuisChampLocal(f.cloture_depot),
    date_resultats: depuisChampLocal(f.date_resultats),
  })
}
</script>

<template>
  <form class="form" @submit.prevent="soumettre">
    <div class="champ">
      <label for="titre">Titre</label>
      <input id="titre" v-model="f.titre" type="text" maxlength="120" required>
    </div>
    <div class="champ">
      <label for="theme">Thème imposé</label>
      <input id="theme" v-model="f.theme" type="text" maxlength="200" required>
    </div>
    <div class="champ">
      <label for="brief">Brief</label>
      <p id="aide-brief" class="champ__aide">Sujet et contraintes, 2&nbsp;000 caractères au plus. Affiché tel quel, sans mise en forme.</p>
      <textarea id="brief" v-model="f.brief" rows="8" maxlength="2000" required aria-describedby="aide-brief" />
    </div>
    <div class="champ">
      <label for="langages">Langages admis</label>
      <p id="aide-langages" class="champ__aide">Séparés par des virgules (exemple&nbsp;: TypeScript, Go).</p>
      <input id="langages" v-model="f.langages" type="text" required aria-describedby="aide-langages">
    </div>

    <fieldset class="groupe">
      <legend>Visibilité</legend>
      <div class="champ champ--case">
        <input id="visibilite-publique" v-model="f.visibilite" type="radio" name="visibilite" value="publique" aria-describedby="aide-publique">
        <label for="visibilite-publique">Publique</label>
        <p id="aide-publique" class="champ__aide">Listée sur l'accueil&nbsp;; tout compte actif s'inscrit.</p>
      </div>
      <div class="champ champ--case">
        <input id="visibilite-invitation" v-model="f.visibilite" type="radio" name="visibilite" value="invitation" aria-describedby="aide-invitation">
        <label for="visibilite-invitation">Sur invitation</label>
        <p id="aide-invitation" class="champ__aide">Non listée&nbsp;; on entre par un lien secret.</p>
      </div>
    </fieldset>

    <fieldset class="groupe">
      <legend>Ton rôle</legend>
      <div class="champ champ--case">
        <input id="role-juge" v-model="f.role_boss" type="radio" name="role_boss" value="juge" aria-describedby="aide-juge">
        <label for="role-juge">Juge</label>
        <p id="aide-juge" class="champ__aide">Tu ne déposes pas&nbsp;: tu votes.</p>
      </div>
      <div class="champ champ--case">
        <input id="role-joueur" v-model="f.role_boss" type="radio" name="role_boss" value="joueur" aria-describedby="aide-joueur">
        <label for="role-joueur">Joueur</label>
        <p id="aide-joueur" class="champ__aide">Tu déposes et tu occupes une place.</p>
      </div>
    </fieldset>

    <div class="champ">
      <label for="max_participants">Nombre de places</label>
      <p id="aide-max" class="champ__aide">10 au plus.</p>
      <input id="max_participants" v-model.number="f.max_participants" type="number" min="1" max="10" step="1" required aria-describedby="aide-max">
    </div>
    <div class="champ">
      <label for="ouverture_inscriptions">Ouverture des inscriptions</label>
      <p id="aide-dates" class="champ__aide">Heure de Paris. Le dépôt ferme au plus 30 jours après l'ouverture, les résultats tombent au plus 15 jours après.</p>
      <input id="ouverture_inscriptions" v-model="f.ouverture_inscriptions" type="datetime-local" required aria-describedby="aide-dates">
    </div>
    <div class="champ">
      <label for="cloture_depot">Clôture du dépôt</label>
      <input id="cloture_depot" v-model="f.cloture_depot" type="datetime-local" required>
    </div>
    <div class="champ">
      <label for="date_resultats">Date des résultats</label>
      <input id="date_resultats" v-model="f.date_resultats" type="datetime-local" required>
    </div>

    <p class="btns"><button class="btn btn--primary" type="submit" :aria-disabled="occupe">{{ occupe ? 'Enregistrement…' : initial ? 'Enregistrer la campagne' : 'Créer le brouillon' }}</button></p>
  </form>
</template>
