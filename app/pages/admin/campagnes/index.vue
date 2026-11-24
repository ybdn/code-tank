<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Campagnes' })

const { data: campagnes } = await useLectureAdmin<{ id: string; slug: string; titre: string; statut: string; ouverture_inscriptions: string; cloture_depot: string; max_participants: number }[]>('/api/admin/campagnes')
const { occupe, alerte, erreurs, lancer } = useAction()

async function creer(corps: CorpsCampagne) {
  const r = await lancer(() => $fetch<{ slug: string }>('/api/admin/campagnes', { method: 'POST', body: corps }), 'Brouillon créé.')
  if (r) await navigateTo(`/admin/campagnes/${r.slug}`)
}
</script>

<template>
  <section class="section">
    <div class="wrap">
      <h1>Campagnes</h1>

      <PanneauxAdmin :panneaux="[{ id: 'liste', titre: 'Toutes les campagnes', nb: campagnes.length }, { id: 'nouvelle', titre: 'Nouvelle campagne' }]" libelle="Campagnes">
        <template #liste>
          <h2>Toutes les campagnes</h2>
          <p v-if="!campagnes.length" class="vide">Aucune campagne pour l'instant.</p>
          <div v-else class="tableau tableau--liste" role="region" aria-label="Campagnes" tabindex="0">
            <!-- Rôles explicites : au téléphone, le tableau passe en fiches (display: block), qui sans eux perdraient la sémantique de tableau. -->
            <table role="table">
              <thead role="rowgroup">
                <tr role="row"><th scope="col" role="columnheader">Campagne</th><th scope="col" role="columnheader">Statut</th><th scope="col" role="columnheader">Inscriptions dès le</th><th scope="col" role="columnheader">Clôture du dépôt</th><th scope="col" role="columnheader">Participants</th></tr>
              </thead>
              <tbody role="rowgroup">
                <tr v-for="c in campagnes" :key="c.id" role="row">
                  <th scope="row" role="rowheader"><NuxtLink :to="`/admin/campagnes/${c.slug}`">{{ c.titre }}</NuxtLink></th>
                  <td role="cell">{{ STATUT_ADMIN[c.statut] }}</td>
                  <td role="cell" data-label="Inscriptions dès le">{{ formaterDateCourte(c.ouverture_inscriptions) }}</td>
                  <td role="cell" data-label="Clôture du dépôt">{{ formaterDateCourte(c.cloture_depot) }}</td>
                  <td role="cell" data-label="Participants">{{ c.max_participants }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <template #nouvelle>
          <h2>Nouvelle campagne</h2>
          <p class="lead">Elle naît en brouillon, invisible du public. Les critères et les jurés du § 5 sont préremplis.</p>
          <p v-if="alerte" role="alert" class="avis avis--erreur">{{ alerte }}</p>
          <FormulaireCampagne :erreurs="erreurs" :occupe="occupe" @envoyer="creer" />
        </template>
      </PanneauxAdmin>
    </div>
  </section>
</template>
