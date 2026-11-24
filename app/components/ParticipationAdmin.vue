<script setup lang="ts">
// Une participation vue par l'organisateur : réception, dépôt accepté, alertes, vote du Boss à l'aveugle, puis, le vote
// verrouillé, audits, réplique, case de réutilisation et décisions. Tout texte venu d'un candidat ou de Claude est interpolé
// comme du texte, jamais comme du HTML.
const props = defineProps<{ participation: ParticipationAdmin; campagne: CampagneAdmin }>()
const emit = defineEmits<{ change: [] }>()

const p = computed(() => props.participation)
const { occupe, message, alerte, erreurs, lancer } = useAction()

const ETAT_RECEPTION = { en_attente: 'en attente de contrôle', acceptee: 'acceptée', refusee: 'refusée' }
const TYPES_DECISION: Record<string, string> = {
  departage: 'Départage (justification publique)',
  disqualification: 'Disqualification (justification publique)',
  fermeture_compte: 'Fermeture du compte (justification non publique)',
}
const voteOuvert = computed(() => ['deliberation', 'prete'].includes(props.campagne.statut))
const libelleCritere = (cle?: string) => props.campagne.criteres.find((c) => c.cle === cle)?.libelle ?? cle ?? '—'
const octets = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.ceil(n / 1024)} Ko`)

const contradictions = computed(() => (p.value.depot ? contradictionsIa(p.value.depot.traces_ia) : []))
const nbAlertes = computed(() => {
  const d = p.value.depot
  return d ? Number(d.alerte_manipulation) + d.alertes_integrite.length + contradictions.value.length : 0
})
const etatVote = computed(() => (p.value.vote?.verrouille_le ? 'verrouillé' : p.value.vote ? 'enregistré, non verrouillé' : 'pas encore noté'))

const saisie = reactive({
  note: (p.value.vote?.note ?? '') as number | '',
  commentaire: p.value.vote?.commentaire ?? '',
  type: '',
  justification: '',
})
const confirmation = ref<string | null>(null)

async function agir(requete: () => Promise<unknown>, ok: string) {
  const r = await lancer(requete, ok)
  confirmation.value = null
  if (r) emit('change')
  return r
}
const enregistrerVote = () =>
  agir(() => $fetch(`/api/admin/participations/${p.value.id}/vote`, { method: 'PUT', body: { note: saisie.note, commentaire: saisie.commentaire } }), 'Vote enregistré, pas encore verrouillé.')
const verrouiller = () => agir(() => $fetch(`/api/admin/participations/${p.value.id}/verrouillage`, { method: 'POST' }), 'Vote verrouillé : les audits sont maintenant lisibles.')
const demasquer = (id: string) => agir(() => $fetch(`/api/admin/audits/${id}/demasquage`, { method: 'POST' }), 'Réplique démasquée.')
const masquer = (id: string) => agir(() => $fetch(`/api/admin/audits/${id}/masquage`, { method: 'POST' }), 'Réplique masquée.')
async function decider() {
  const r = await agir(() => $fetch(`/api/admin/participations/${p.value.id}/decision`, { method: 'POST', body: { type: saisie.type, justification: saisie.justification } }), 'Décision enregistrée.')
  if (r) saisie.justification = ''
}
async function telecharger() {
  const r = await lancer(() => $fetch<{ url: string }>(`/api/admin/participations/${p.value.id}/archive`), 'Téléchargement lancé : le lien n\'est valable que 60 secondes.')
  if (r) window.location.assign(r.url)
}
const champ = (n: string, aide?: string) => ({
  'aria-invalid': erreurs.value[n] ? ('true' as const) : undefined,
  'aria-describedby': [aide, erreurs.value[n] ? `err-${n}-${p.value.id}` : undefined].filter(Boolean).join(' ') || undefined,
})
</script>

<template>
  <details class="bloc">
    <summary>
      <strong>{{ p.pseudo }}</strong>
      : réception {{ p.reception ? ETAT_RECEPTION[p.reception.etat] : 'aucune' }}, dépôt {{ p.depot ? 'accepté' : 'aucun' }}, vote {{ etatVote }}<template v-if="nbAlertes">, <strong>{{ nbAlertes }} alerte{{ nbAlertes > 1 ? 's' : '' }}</strong></template>
    </summary>

    <div class="bloc__corps">
      <div role="status" aria-live="polite"><p v-if="message" class="avis">{{ message }}</p></div>
      <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>

      <p>Vrai nom : {{ p.vrai_nom || '—' }}. Inscrit le {{ formaterDate(p.inscrit_le) }}.</p>

      <h3>Réception</h3>
      <p v-if="!p.reception">Aucun envoi reçu.</p>
      <template v-else>
        <p>
          État : <strong>{{ ETAT_RECEPTION[p.reception.etat] }}</strong>, reçue le {{ formaterDate(p.reception.recue_le) }}<template v-if="p.reception.traitee_le">, traitée le {{ formaterDate(p.reception.traitee_le) }}</template>.
        </p>
        <ul v-if="p.reception.motifs_refus.length">
          <li v-for="(m, n) in p.reception.motifs_refus" :key="n">{{ m.message ?? m.code }}</li>
        </ul>
      </template>

      <h3>Dépôt accepté</h3>
      <p v-if="!p.depot">Aucun dépôt accepté pour l'instant.</p>
      <template v-else>
        <dl class="infos">
          <dt>Présentation</dt><dd class="brief">{{ p.depot.presentation }}</dd>
          <dt>Demande au jury</dt><dd>{{ p.depot.demande ?? '—' }}</dd>
          <dt>Type de code</dt><dd>{{ p.depot.type_code === 'open_source' ? 'Open source' : 'Propriétaire' }}, licence {{ p.depot.licence_presente ? 'présente' : 'absente' }}</dd>
          <dt>Fichiers</dt><dd>{{ p.depot.nb_fichiers }} retenus, {{ p.depot.fichiers_exclus.length }} exclus</dd>
          <dt>Taille</dt><dd>{{ p.depot.nb_tokens.toLocaleString('fr-FR') }} tokens, archive de {{ octets(p.depot.taille_octets) }}</dd>
          <dt>Empreinte SHA-256</dt><dd class="empreinte">{{ p.depot.sha256 }}</dd>
          <dt>Déposé le</dt><dd>{{ formaterDate(p.depot.depose_le) }}</dd>
          <dt>Outils d'IA déclarés</dt><dd>{{ p.depot.outils_ia.length ? p.depot.outils_ia.join(', ') : 'Aucun' }}</dd>
        </dl>
        <details v-if="p.depot.fichiers_exclus.length">
          <summary>Fichiers exclus ({{ p.depot.fichiers_exclus.length }})</summary>
          <ul><li v-for="(f, n) in p.depot.fichiers_exclus" :key="n">{{ libelleElement(f) }}</li></ul>
        </details>

        <h3>Alertes</h3>
        <div v-for="(c, n) in contradictions" :key="n" class="avis avis--erreur" role="note">
          <strong>Contradiction avec la déclaration.</strong> {{ c }} Demande une explication au candidat : on ne sanctionne jamais sur un détecteur.
        </div>
        <p v-if="p.depot.alerte_manipulation" class="avis avis--erreur"><strong>Manipulation.</strong> Une phrase visant le jury a été relevée dans le dépôt (accepté, signalé).</p>
        <template v-if="p.depot.alertes_integrite.length">
          <p><strong>Intégrité :</strong></p>
          <ul><li v-for="(a, n) in p.depot.alertes_integrite" :key="n">{{ libelleElement(a) }}</li></ul>
        </template>
        <template v-if="p.depot.traces_ia.length">
          <p><strong>Traces d'outils d'IA relevées :</strong></p>
          <ul><li v-for="(t, n) in p.depot.traces_ia" :key="n">{{ libelleElement(t) }}</li></ul>
        </template>
        <p v-if="!nbAlertes && !p.depot.traces_ia.length" class="note-claire">Aucune alerte.</p>
      </template>

      <template v-if="p.depot?.archive || p.reception">
        <h3>Archive</h3>
        <p id="regle-aucune-execution" class="note-claire">Aucun dépôt n'est exécuté, par personne : l'archive se lit comme une donnée, jamais on ne lance son contenu.</p>
        <p class="btns">
          <button class="btn" type="button" :disabled="occupe" aria-describedby="regle-aucune-execution" @click="telecharger">Télécharger l'archive<span class="sr-only"> de {{ p.pseudo }}</span></button>
        </p>
      </template>

      <template v-if="p.depot">
        <h3>Vote du Boss</h3>
        <p v-if="!p.vote?.verrouille_le" class="note-claire">
          Vote à l'aveugle : tant qu'il n'est pas verrouillé, la note de Claude, le rapport et la case de réutilisation sont absents, car la base les refuse à ta session.
        </p>

        <template v-if="p.vote?.verrouille_le">
          <p>Note : <strong>{{ p.vote.note }}/10</strong>, verrouillée le {{ formaterDate(p.vote.verrouille_le) }}.</p>
          <p v-if="p.vote.commentaire" class="brief">{{ p.vote.commentaire }}</p>
        </template>
        <template v-else>
          <p v-if="!voteOuvert" class="avis">Le vote s'ouvre quand la campagne passe en délibération.</p>
          <form v-else class="form" novalidate @submit.prevent="enregistrerVote">
            <div class="champ">
              <label :for="`note-${p.id}`">Note de 0 à 10</label>
              <input :id="`note-${p.id}`" v-model.number="saisie.note" class="court" type="number" min="0" max="10" step="1" required v-bind="champ('note')">
              <p v-if="erreurs.note" :id="`err-note-${p.id}`" class="champ__erreur">{{ erreurs.note }}</p>
            </div>
            <div class="champ">
              <label :for="`commentaire-${p.id}`">Commentaire (facultatif)</label>
              <textarea :id="`commentaire-${p.id}`" v-model="saisie.commentaire" rows="3" maxlength="2000" v-bind="champ('commentaire')" />
              <p v-if="erreurs.commentaire" :id="`err-commentaire-${p.id}`" class="champ__erreur">{{ erreurs.commentaire }}</p>
            </div>
            <p class="btns">
              <button class="btn" type="submit" :disabled="occupe">Enregistrer le vote</button>
              <button v-if="p.vote && confirmation !== 'verrou'" class="btn btn--primary" type="button" :disabled="occupe" @click="confirmation = 'verrou'">Verrouiller le vote</button>
            </p>
          </form>
          <div v-if="confirmation === 'verrou'" class="avis" role="group" :aria-labelledby="`verrou-${p.id}`">
            <p :id="`verrou-${p.id}`">Un vote verrouillé ne se modifie plus. Le vote enregistré ({{ p.vote?.note }}/10) sera définitif, et les notes de Claude, les rapports et la case de réutilisation deviendront lisibles.</p>
            <p class="btns">
              <button class="btn btn--primary" type="button" :disabled="occupe" @click="verrouiller">Verrouiller définitivement</button>
              <button class="btn" type="button" :disabled="occupe" @click="confirmation = null">Annuler</button>
            </p>
          </div>
        </template>
      </template>

      <template v-if="p.apres">
        <h3>Après le verrouillage</h3>
        <p>D'accord pour être contacté au sujet d'une réutilisation : <strong>{{ p.apres.contact_reutilisation === null ? '—' : p.apres.contact_reutilisation ? 'oui' : 'non' }}</strong>.</p>
        <p v-if="p.apres.note_outillage !== null">Critère calculé par script (outillage et doc) : <strong>{{ p.apres.note_outillage }}/10</strong>.</p>
        <p v-if="!p.apres.audits.length">Aucun audit enregistré pour ce dépôt.</p>

        <article v-for="a in p.apres.audits" :key="a.id" class="audit" :aria-labelledby="`audit-${a.id}`">
          <h4 :id="`audit-${a.id}`">{{ NOM_JURE[a.jure] ?? a.jure }}</h4>
          <p class="note-claire">
            Audit {{ a.statut === 'termine' ? 'terminé' : a.statut === 'echec' ? 'en échec' : 'en cours' }} · {{ a.modele }} · consignes {{ a.version_consignes }}
            · {{ a.tentatives }} tentative{{ a.tentatives > 1 ? 's' : '' }} · coût {{ a.cout_usd === null ? '—' : `${a.cout_usd} $` }}
          </p>
          <template v-if="a.resultat">
            <p v-if="a.resultat.verdict">Verdict : <strong>{{ a.resultat.verdict === 'convaincu' ? 'Convaincu' : a.resultat.verdict === 'pas_convaincu' ? 'Pas convaincu' : a.resultat.verdict }}</strong></p>
            <p v-if="a.resultat.manipulation_detectee?.detectee" class="avis avis--erreur"><strong>Manipulation détectée par ce juré.</strong> {{ (a.resultat.manipulation_detectee.preuves ?? []).map(libelleElement).join(' · ') }}</p>
            <div v-if="a.resultat.criteres?.length" class="tableau" role="region" :aria-label="`Notes de ${NOM_JURE[a.jure] ?? a.jure}`" tabindex="0">
              <table>
                <thead><tr><th scope="col">Critère</th><th scope="col">Note</th><th scope="col">Justification et preuves</th></tr></thead>
                <tbody>
                  <tr v-for="(c, n) in a.resultat.criteres" :key="n">
                    <th scope="row">{{ libelleCritere(c.cle) }}</th>
                    <td>{{ c.note ?? '—' }}/10</td>
                    <td>
                      {{ c.justification }}
                      <ul v-if="c.preuves?.length"><li v-for="(pr, k) in c.preuves" :key="k"><code>{{ pr.fichier }}:{{ pr.ligne }}</code> {{ pr.constat }}</li></ul>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <template v-if="a.resultat.points_forts?.length">
              <p><strong>Points forts</strong></p>
              <ul><li v-for="(t, n) in a.resultat.points_forts" :key="n">{{ t }}</li></ul>
            </template>
            <template v-if="a.resultat.a_ameliorer?.length">
              <p><strong>À améliorer</strong></p>
              <ul><li v-for="(t, n) in a.resultat.a_ameliorer" :key="n">{{ t }}</li></ul>
            </template>
            <p><strong>Réplique</strong> <template v-if="a.replique_masquee">(masquée : le candidat ne la verra pas)</template></p>
            <p class="brief">{{ a.resultat.replique ?? '—' }}</p>
            <p v-if="a.replique_masquee" class="btns">
              <button class="btn" type="button" :disabled="occupe" @click="demasquer(a.id)">Démasquer la réplique<span class="sr-only"> de {{ NOM_JURE[a.jure] ?? a.jure }}</span></button>
            </p>
            <template v-else>
              <p v-if="confirmation !== `masque-${a.id}`" class="btns">
                <button class="btn" type="button" :disabled="occupe" @click="confirmation = `masque-${a.id}`">Masquer la réplique<span class="sr-only"> de {{ NOM_JURE[a.jure] ?? a.jure }}</span></button>
              </p>
              <div v-else class="avis" role="group" :aria-labelledby="`masque-${a.id}`">
                <p :id="`masque-${a.id}`">Masquer cette réplique ? Les notes ne changent pas. Tu pourras la démasquer.</p>
                <p class="btns">
                  <button class="btn btn--primary" type="button" :disabled="occupe" @click="masquer(a.id)">Masquer</button>
                  <button class="btn" type="button" :disabled="occupe" @click="confirmation = null">Annuler</button>
                </p>
              </div>
            </template>
          </template>
          <p v-else>Aucun résultat pour cet audit.</p>
        </article>

        <h3>Décisions</h3>
        <ul v-if="p.decisions.length">
          <li v-for="d in p.decisions" :key="d.id"><strong>{{ TYPES_DECISION[d.type] ?? d.type }}</strong>, le {{ formaterDate(d.prise_le) }} : {{ d.justification }}</li>
        </ul>
        <p v-else class="note-claire">Aucune décision.</p>

        <form class="form" novalidate @submit.prevent="confirmation = 'decision'">
          <p class="avis">La justification d'une disqualification et d'un départage est <strong>publique</strong> : elle figure au classement. Aucune décision ne s'annule.</p>
          <div class="champ">
            <label :for="`type-${p.id}`">Type de décision</label>
            <select :id="`type-${p.id}`" v-model="saisie.type" required v-bind="champ('type')">
              <option value="" disabled>Choisir…</option>
              <option v-for="(libelle, cle) in TYPES_DECISION" :key="cle" :value="cle">{{ libelle }}</option>
            </select>
            <p v-if="erreurs.type" :id="`err-type-${p.id}`" class="champ__erreur">{{ erreurs.type }}</p>
          </div>
          <div class="champ">
            <label :for="`justification-${p.id}`">Justification (obligatoire)</label>
            <textarea :id="`justification-${p.id}`" v-model="saisie.justification" rows="3" maxlength="2000" required v-bind="champ('justification')" />
            <p v-if="erreurs.justification" :id="`err-justification-${p.id}`" class="champ__erreur">{{ erreurs.justification }}</p>
          </div>
          <p v-if="confirmation !== 'decision'" class="btns"><button class="btn" type="submit" :disabled="occupe || !saisie.type || !saisie.justification.trim()">Enregistrer la décision</button></p>
        </form>
        <div v-if="confirmation === 'decision'" class="avis" role="group" :aria-labelledby="`decision-${p.id}`">
          <p :id="`decision-${p.id}`">
            Enregistrer cette décision pour {{ p.pseudo }} ?
            <template v-if="saisie.type !== 'fermeture_compte'">La justification sera publique.</template>
            <template v-else>Le compte sera fermé.</template>
            Elle ne pourra pas être annulée.
          </p>
          <p class="btns">
            <button class="btn btn--primary" type="button" :disabled="occupe" @click="decider">Confirmer</button>
            <button class="btn" type="button" :disabled="occupe" @click="confirmation = null">Annuler</button>
          </p>
        </div>
      </template>
    </div>
  </details>
</template>
