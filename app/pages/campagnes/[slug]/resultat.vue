<script setup lang="ts">
import type { Jure } from '~/components/mascottes'

const slug = String(useRoute().params.slug)
const campagne = await useCampagne(slug)
useHead({ title: `Mon entretien · ${campagne.value.titre}`, meta: [{ name: 'robots', content: 'noindex' }] })

// Le serveur lit avec la session du visiteur : sans session, 401 ; sans résultat à son nom, 404.
const publie = STATUTS_RESULTATS.includes(campagne.value.statut)
const { data, error } = await useFetch<ResultatCandidat>(`/api/campagnes/${slug}/resultat`, { retry: 0, key: `resultat-${slug}`, immediate: publie })

const nom = (jure: string) => JURES_CLAUDE.find((j) => j.jure === jure)?.nom ?? jure
const sortie = (jure: string) => data.value?.jures.find((j) => j.jure === jure)?.sortie
const critereDe = (jure: string) => (data.value?.criteres ?? []).filter((c) => c.jure === jure)
const noteDe = (c: Critere) => (c.calcule ? data.value?.ligne?.notes?.[c.cle] : sortie(c.jure)?.criteres.find((x) => x.cle === c.cle)?.note) ?? null
const audit = (c: Critere) => sortie(c.jure)?.criteres.find((x) => x.cle === c.cle)
const manipulations = computed(() => (data.value?.jures ?? []).filter((j) => j.sortie.manipulation.detectee))
const avecPoints = computed(() => (data.value?.jures ?? []).filter((j) => j.sortie.points_forts.length || j.sortie.a_ameliorer.length))
const mascotte = (jure: string) => jure as Jure
</script>

<template>
  <section class="section" aria-labelledby="resultat-h">
    <div class="wrap texte resultats">
      <p><NuxtLink class="retour" :to="`/campagnes/${slug}`">← {{ campagne.titre }}</NuxtLink></p>
      <h1 id="resultat-h">Ton entretien avec le jury</h1>

      <p v-if="!publie">Les résultats de cette campagne ne sont pas encore publiés. <NuxtLink :to="`/campagnes/${slug}`">Retour à la campagne</NuxtLink></p>
      <template v-else-if="error?.statusCode === 401">
        <p>Connecte-toi avec ton compte pour voir ton entretien et ton rapport : ils ne sont visibles que de toi.</p>
        <p class="btns"><NuxtLink class="btn btn--primary" to="/compte">Se connecter</NuxtLink></p>
      </template>
      <template v-else-if="error?.statusCode === 404">
        <p>Tu n'as pas d'entretien dans cette campagne : tu n'y as pas déposé de code, ou tu es connecté avec un autre compte.</p>
        <p class="btns"><NuxtLink class="btn" :to="`/campagnes/${slug}`">Voir le classement</NuxtLink></p>
      </template>
      <p v-else-if="error || !data" role="alert" class="avis avis--erreur">Ton entretien ne peut pas être lu pour le moment. Réessaie dans un instant.</p>

      <template v-else>
        <p v-if="data.ligne" class="lead">
          <template v-if="data.ligne.disqualifie">Ton dépôt a été disqualifié.</template>
          <template v-else-if="data.ligne.rang !== null">Tu termines {{ ordinal(data.ligne.rang) }}.</template>
          <template v-else>Ton dépôt n'est pas classé.</template>
        </p>
        <p v-if="data.ligne?.disqualifie" class="avis">Justification de l'organisateur, publique : {{ data.ligne.justification }}</p>
        <p v-if="data.ligne?.justification_departage" class="avis">À égalité de score, l'organisateur t'a départagé. Justification publique : {{ data.ligne.justification_departage }}</p>

        <template v-if="data.demande">
          <h2>Ta demande</h2>
          <!-- Texte du candidat : rendu comme du texte, jamais comme du HTML. -->
          <p class="brief">{{ data.demande }}</p>
        </template>

        <h2>L'entretien</h2>
        <article v-for="j in JURES_CLAUDE" :key="j.jure" class="jure" :aria-labelledby="`jure-${j.jure}`">
          <div class="jure__tete"><MascottePixel :jure="mascotte(j.jure)" /></div>
          <div class="jure__corps">
            <h3 :id="`jure-${j.jure}`">{{ j.nom }}</h3>
            <template v-if="sortie(j.jure)">
              <p v-if="libelleVerdict(sortie(j.jure)!.verdict)" class="verdict" :data-verdict="sortie(j.jure)!.verdict">{{ libelleVerdict(sortie(j.jure)!.verdict) }}</p>
              <blockquote v-if="sortie(j.jure)!.replique" class="replique"><p>{{ sortie(j.jure)!.replique }}</p></blockquote>
            </template>
            <p v-else class="note-claire">Ce juré n'a pas rendu d'audit pour ton dépôt.</p>
            <ul class="criteres criteres--notes">
              <li v-for="c in critereDe(j.jure)" :key="c.cle">
                <span>{{ c.libelle }}</span><span>{{ noteDe(c) ?? '—' }} sur 10</span>
                <JaugePixel v-if="noteDe(c) !== null" :valeur="Number(noteDe(c))" :max="10" :cases="10" />
              </li>
            </ul>
          </div>
        </article>

        <article class="jure" aria-labelledby="jure-boss">
          <div class="jure__tete"><MascottePixel jure="boss" /></div>
          <div class="jure__corps">
            <h3 id="jure-boss">Le Boss</h3>
            <p class="note-claire">Il a noté ton projet sans voir les notes des quatre autres jurés.</p>
            <ul v-if="data.ligne" class="criteres">
              <li><span>Note du Boss</span><span>{{ formaterNombre(data.ligne.note_boss) }} sur 10</span></li>
              <li><span>Score Claude</span><span>{{ formaterNombre(data.ligne.score_claude) }} sur 100</span></li>
              <li><span>Score final</span><strong>{{ formaterNombre(data.ligne.score_final) }} sur 100</strong></li>
            </ul>
            <!-- Commentaire du Boss sur le candidat : texte libre, rendu comme du texte, jamais comme du HTML. -->
            <blockquote v-if="data.commentaire_boss" class="replique"><p>{{ data.commentaire_boss }}</p></blockquote>
            <p class="note-claire">Score final = deux tiers du score Claude + un tiers de la note du Boss ramenée sur 100.</p>
          </div>
        </article>

        <h2>Ton rapport</h2>
        <article v-for="c in data.criteres" :key="c.cle" class="audit" :aria-labelledby="`critere-${c.cle}`">
          <h3 :id="`critere-${c.cle}`">{{ c.libelle }}</h3>
          <p class="note-claire">{{ c.calcule ? 'Note calculée par un script' : `Note de ${nom(c.jure)}` }} · poids {{ c.poids }} % · <strong>{{ noteDe(c) ?? '—' }} sur 10</strong></p>
          <template v-if="audit(c)">
            <p>{{ audit(c)!.justification }}</p>
            <ul v-if="audit(c)!.preuves.length" class="preuves" :aria-label="`Preuves : ${c.libelle}`">
              <li v-for="(p, i) in audit(c)!.preuves" :key="i"><code>{{ p.fichier }}:{{ p.ligne }}</code> {{ p.constat }}</li>
            </ul>
          </template>
        </article>

        <template v-if="avecPoints.length">
          <h2>Points forts et pistes d'amélioration</h2>
          <article v-for="j in avecPoints" :key="j.jure" class="audit" :aria-labelledby="`points-${j.jure}`">
            <h3 :id="`points-${j.jure}`">{{ nom(j.jure) }}</h3>
            <template v-if="j.sortie.points_forts.length">
              <h4>Points forts</h4>
              <ul><li v-for="(t, i) in j.sortie.points_forts" :key="i">{{ t }}</li></ul>
            </template>
            <template v-if="j.sortie.a_ameliorer.length">
              <h4>À améliorer</h4>
              <ul><li v-for="(t, i) in j.sortie.a_ameliorer" :key="i">{{ t }}</li></ul>
            </template>
          </article>
        </template>

        <section v-if="manipulations.length" class="avis" aria-labelledby="manipulation-h">
          <h2 id="manipulation-h">Un passage adressé au jury</h2>
          <p>Un relevé n'est pas une décision : une disqualification n'existe que si l'organisateur la confirme, et elle s'affiche alors avec sa justification publique.</p>
          <div v-for="j in manipulations" :key="j.jure">
            <h3>Relevé par {{ nom(j.jure) }}</h3>
            <ul class="preuves">
              <li v-for="(p, i) in j.sortie.manipulation.preuves" :key="i"><code>{{ p.fichier }}:{{ p.ligne }}</code> {{ p.constat }}</li>
            </ul>
          </div>
        </section>

        <p class="btns"><NuxtLink class="btn" :to="`/campagnes/${slug}`">Voir le classement</NuxtLink></p>
      </template>
    </div>
  </section>
</template>
