<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Administration' })

const { data: comptes } = await useLectureAdmin<{ plafond: number | null; comptes: CompteAdmin[] }>('/api/admin/comptes')
const { data: campagnes } = await useLectureAdmin<{ id: string; slug: string; titre: string; statut: string; cloture_depot: string }[]>('/api/admin/campagnes')
const nb = (etat: string) => comptes.value.comptes.filter((c) => c.etat === etat).length
</script>

<template>
  <section class="section">
    <div class="wrap">
      <h1>Administration</h1>

      <h2>Comptes à décider</h2>
      <p>
        <strong>{{ nb('verifie') }}</strong> compte{{ nb('verifie') > 1 ? 's' : '' }} vérifié{{ nb('verifie') > 1 ? 's' : '' }} attend{{ nb('verifie') > 1 ? 'ent' : '' }} ton autorisation,
        <strong>{{ nb('liste_attente') }}</strong> en liste d'attente.
      </p>
      <p class="btns"><NuxtLink class="btn btn--primary" to="/admin/comptes">Voir les comptes</NuxtLink></p>

      <h2>Campagnes</h2>
      <p v-if="!campagnes.length" class="vide">Aucune campagne pour l'instant.</p>
      <div v-else class="tableau" role="region" aria-label="Campagnes" tabindex="0">
        <table>
          <thead><tr><th scope="col">Campagne</th><th scope="col">Statut</th><th scope="col">Clôture du dépôt</th></tr></thead>
          <tbody>
            <tr v-for="c in campagnes" :key="c.id">
              <th scope="row"><NuxtLink :to="`/admin/campagnes/${c.slug}`">{{ c.titre }}</NuxtLink></th>
              <td>{{ STATUT_ADMIN[c.statut] }}</td>
              <td>{{ formaterDate(c.cloture_depot) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="btns"><NuxtLink class="btn" to="/admin/campagnes">Gérer les campagnes</NuxtLink></p>
    </div>
  </section>
</template>
