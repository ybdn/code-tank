<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Comptes' })

const { data, refresh } = await useLectureAdmin<{ plafond: number | null; comptes: CompteAdmin[] }>('/api/admin/comptes')
const { occupe, message, alerte, lancer } = useAction()

// Dans l'ordre du parcours d'un compte (SPECS § 3). Seuls « vérifié » et « liste d'attente » appellent une décision.
const GROUPES = [
  { etat: 'verifie', titre: 'Vérifiés, en attente d\'autorisation' },
  { etat: 'liste_attente', titre: 'Liste d\'attente' },
  { etat: 'email_a_verifier', titre: 'E-mail à vérifier' },
  { etat: 'autorise', titre: 'Autorisés' },
  { etat: 'refuse', titre: 'Refusés' },
  { etat: 'ferme', titre: 'Fermés' },
]
const ACTIONS: Record<string, { etat: string; libelle: string }[]> = {
  verifie: [{ etat: 'autorise', libelle: 'Autoriser' }, { etat: 'refuse', libelle: 'Refuser' }, { etat: 'liste_attente', libelle: 'Mettre en liste d\'attente' }],
  liste_attente: [{ etat: 'autorise', libelle: 'Autoriser' }, { etat: 'refuse', libelle: 'Refuser' }],
}
const comptes = computed(() => data.value.comptes)
const parEtat = (etat: string) => comptes.value.filter((c) => c.etat === etat)
const panneaux = computed(() => GROUPES.map((g) => ({ id: g.etat, titre: g.titre, nb: parEtat(g.etat).length, urgent: Boolean(ACTIONS[g.etat]) })))
const autorises = computed(() => parEtat('autorise').length)
// Ce que compte le plafond : comptes vérifiés ou autorisés (déclencheur de la base).
const comptesPris = computed(() => autorises.value + parEtat('verifie').length)
const plafondAtteint = computed(() => data.value.plafond !== null && comptesPris.value >= data.value.plafond)

const choix = ref<{ id: string; etat: string } | null>(null)
async function decider(c: CompteAdmin, etat: string) {
  const r = await lancer(() => $fetch<{ courriel: 'envoye' | 'echec' | 'non_verifiee' }>(`/api/admin/comptes/${c.id}/decision`, { method: 'POST', body: { etat } }), `Décision enregistrée pour ${c.pseudo}.`)
  choix.value = null
  if (r) {
    message.value += { envoye: ' L\'e-mail de décision est parti.', echec: ' L\'e-mail de décision n\'a pas pu partir ; il n\'y a pas de renvoi, préviens le candidat toi-même.', non_verifiee: ' Aucun e-mail : son adresse n\'est pas vérifiée.' }[r.courriel]
    await refresh()
  }
}

const lien = (url: string) => (/^https:\/\//.test(url) ? url : undefined)
const date = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(iso)) : '—')
</script>

<template>
  <section class="section">
    <div class="wrap">
      <h1>Comptes</h1>
      <p>
        Comptes autorisés : <strong>{{ autorises }}</strong>. Plafond de comptes :
        <strong>{{ data.plafond === null ? 'aucun' : data.plafond }}</strong>
        <template v-if="data.plafond !== null"> ({{ comptesPris }} vérifiés ou autorisés comptent dans le plafond)</template>.
        <NuxtLink to="/admin/reglages">Modifier</NuxtLink>
      </p>
      <p v-if="plafondAtteint" class="avis">Le plafond est atteint : autoriser un compte de plus le dépasse. La base le permet, c'est ton choix.</p>
      <div role="status" aria-live="polite"><p v-if="message" class="avis">{{ message }}</p></div>
      <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>

      <PanneauxAdmin :panneaux="panneaux" libelle="États des comptes">
        <template v-for="g in GROUPES" :key="g.etat" #[g.etat]>
          <h2 :id="`g-${g.etat}`">{{ g.titre }} ({{ parEtat(g.etat).length }})</h2>
          <p v-if="!parEtat(g.etat).length" class="note-claire">Aucun compte.</p>
          <article v-for="c in parEtat(g.etat)" :key="c.id" class="fiche" :aria-labelledby="`c-${c.id}`">
            <h3 :id="`c-${c.id}`">{{ c.pseudo }}</h3>
            <dl class="infos">
              <dt>Vrai nom</dt><dd>{{ c.vrai_nom }}</dd>
              <dt>E-mail</dt><dd>{{ c.email_contact }} ({{ c.email_verifie_le ? `vérifié le ${date(c.email_verifie_le)}` : 'pas vérifié' }})</dd>
              <dt>Motivation</dt><dd class="brief">{{ c.motivation }}</dd>
              <dt>Dépôt cité</dt>
              <dd>
                <a v-if="lien(c.depot_cite_url)" :href="lien(c.depot_cite_url)" target="_blank" rel="noopener noreferrer">{{ c.depot_cite_url }}</a>
                <template v-else>{{ c.depot_cite_url }}</template>
              </dd>
              <dt>GitHub</dt>
              <dd v-if="c.github_donnees">
                {{ c.github_donnees.login ?? '—' }} · compte créé le {{ date(c.github_donnees.compte_cree_le) }} ·
                {{ c.github_donnees.depots_publics ?? '—' }} dépôts publics · dernière activité {{ date(c.github_donnees.derniere_activite) }}
                ({{ c.github_donnees.evenements_recents ?? '—' }} événements récents) · lu le {{ date(c.github_donnees.lu_le) }}
              </dd>
              <dd v-else>Non lues (GitHub n'a pas répondu à la création du compte).</dd>
              <dt>Compte créé le</dt><dd>{{ date(c.cree_le) }}, état depuis le {{ date(c.etat_le) }}</dd>
            </dl>
            <template v-if="ACTIONS[c.etat]">
              <p v-if="choix?.id !== c.id" class="btns">
                <button v-for="a in ACTIONS[c.etat]" :key="a.etat" class="btn" :class="{ 'btn--primary': a.etat === 'autorise' }" type="button" :disabled="occupe" @click="choix = { id: c.id, etat: a.etat }">
                  {{ a.libelle }}<span class="sr-only"> {{ c.pseudo }}</span>
                </button>
              </p>
              <div v-else class="avis" role="group" :aria-labelledby="`conf-${c.id}`">
                <p :id="`conf-${c.id}`">
                  {{ ACTIONS[c.etat]!.find((a) => a.etat === choix!.etat)!.libelle }} : {{ c.pseudo }} ?
                  <template v-if="choix.etat !== 'liste_attente'">Cette décision est définitive : la base ne permet pas de revenir en arrière.</template>
                </p>
                <p class="btns">
                  <button class="btn btn--primary" type="button" :disabled="occupe" @click="decider(c, choix!.etat)">Confirmer</button>
                  <button class="btn" type="button" :disabled="occupe" @click="choix = null">Annuler</button>
                </p>
              </div>
            </template>
          </article>
        </template>
      </PanneauxAdmin>
    </div>
  </section>
</template>
