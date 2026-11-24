<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Administration' })

const { data } = await useLectureAdmin<TableauDeBord>('/api/admin/tableau-de-bord')
const taches = computed(() => tachesAdmin(data.value))
const urgentes = computed(() => taches.value.filter((t) => t.urgent).length)
const nb = (etat: string) => data.value.comptes[etat] ?? 0
// Ce que compte le plafond : comptes vérifiés ou autorisés (déclencheur de la base).
const pris = computed(() => nb('autorise') + nb('verifie'))
const indicateurs = computed(() => [
  { valeur: nb('verifie'), libelle: 'comptes à décider', lien: '/admin/comptes?panneau=verifie', urgent: nb('verifie') > 0 },
  { valeur: nb('liste_attente'), libelle: 'en liste d\'attente', lien: '/admin/comptes?panneau=liste_attente' },
  { valeur: nb('autorise'), libelle: data.value.plafond_comptes === null ? 'comptes autorisés, sans plafond' : `autorisés · ${pris.value} sur un plafond de ${data.value.plafond_comptes}`, lien: '/admin/comptes?panneau=autorise' },
  { valeur: data.value.campagnes.length, libelle: 'campagnes en cours', lien: '/admin/campagnes' },
])
const dollars = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' })
const avecVotes = (statut: string) => ['deliberation', 'prete', 'publiee'].includes(statut)
const etat = computed(() => {
  if (!taches.value.length) return 'tout est à jour'
  const n = taches.value.length
  return `${n} tâche${n > 1 ? 's' : ''} en attente${urgentes.value ? `, dont ${urgentes.value} urgente${urgentes.value > 1 ? 's' : ''}` : ''}`
})
</script>

<template>
  <section class="section">
    <div class="wrap">
      <header class="tdb__tete">
        <h1>Tableau de bord</h1>
        <p class="invite"><span aria-hidden="true">boss@code-tank&nbsp;~&nbsp;$&nbsp;</span>{{ etat }}<span class="invite__curseur" aria-hidden="true" /></p>
      </header>

      <ul class="indicateurs">
        <li v-for="i in indicateurs" :key="i.lien" :data-urgent="i.urgent ? '' : undefined">
          <NuxtLink :to="i.lien"><strong>{{ String(i.valeur).padStart(2, '0') }}</strong> <span>{{ i.libelle }}</span></NuxtLink>
        </li>
      </ul>

      <div class="tdb__grille">
        <section aria-labelledby="t-taches">
          <h2 id="t-taches">À faire</h2>
          <p v-if="!taches.length" class="taches__vide">Rien n'attend ta décision.</p>
          <ul v-else class="taches">
            <li v-for="t in taches" :key="t.texte" :data-urgent="t.urgent ? '' : undefined">
              <NuxtLink :to="t.lien">
                <span class="taches__signe" aria-hidden="true">{{ t.urgent ? '!' : '·' }}</span>
                <span><span v-if="t.urgent" class="sr-only">Urgent&nbsp;: </span>{{ t.texte }}</span>
                <span class="taches__fleche" aria-hidden="true">→</span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section aria-labelledby="t-jury" class="tdb__jury">
          <h2 id="t-jury">Le plateau</h2>
          <ul class="plateau-mini" aria-hidden="true">
            <li v-for="j in (['sudo', 'refacto', 'lint', 'pitch', 'boss'] as const)" :key="j"><MascottePixel :jure="j" /></li>
          </ul>
          <p class="note-claire">Quatre jurés Claude et toi. Plafond de dépense de l'API par campagne&nbsp;: <strong>{{ dollars.format(data.plafond_depense_usd) }}</strong>. <NuxtLink to="/admin/reglages">Réglages</NuxtLink></p>
        </section>
      </div>

      <h2>Campagnes en cours</h2>
      <p v-if="!data.campagnes.length" class="vide">Aucune campagne en cours. <NuxtLink to="/admin/campagnes?panneau=nouvelle">Créer une campagne</NuxtLink></p>
      <ul v-else class="cartes">
        <li v-for="c in data.campagnes" :key="c.id" class="carte">
          <h3><NuxtLink :to="`/admin/campagnes/${c.slug}`">{{ c.titre }}</NuxtLink></h3>
          <FriseEtapes :statut="c.statut" />
          <p v-if="prochaineEcheance(c)" class="carte__dates">{{ prochaineEcheance(c)!.libelle }}&nbsp;: {{ formaterDate(prochaineEcheance(c)!.date) }}</p>
          <dl class="jauges">
            <div>
              <dt>Inscrits</dt><dd>{{ c.inscrits }}/{{ c.max_participants }}</dd>
              <JaugePixel :valeur="c.inscrits" :max="c.max_participants" />
            </div>
            <div>
              <dt>Dépôts<template v-if="c.receptions_refusees"> · {{ c.receptions_refusees }} refusé{{ c.receptions_refusees > 1 ? 's' : '' }}</template></dt>
              <dd>{{ c.depots }}/{{ c.inscrits }}</dd>
              <JaugePixel :valeur="c.depots" :max="c.inscrits" />
            </div>
            <div v-if="avecVotes(c.statut)">
              <dt>Votes verrouillés</dt><dd>{{ c.votes_verrouilles }}/{{ c.depots }}</dd>
              <JaugePixel :valeur="c.votes_verrouilles" :max="c.depots" />
            </div>
          </dl>
        </li>
      </ul>
    </div>
  </section>
</template>
