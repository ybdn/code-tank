<script setup lang="ts">
const organisateur = useOrganisateur()
const user = useSupabaseUser()
// Le serveur ne voit pas toujours la session au rendu : le libellé ne change qu'après le montage, sans écart d'hydratation.
const connecte = ref(false)
onMounted(() => watchEffect(() => (connecte.value = Boolean(user.value))))
</script>

<template>
  <div class="site">
    <a class="skip" href="#contenu">Aller au contenu</a>
    <header class="nav">
      <div class="wrap nav__bar">
        <NuxtLink class="logo" to="/" aria-label="Code Tank by ybdn.io, accueil"><MascottePixel jure="boss" /><span class="logo__nom" aria-hidden="true"><span class="logo__par">ybdn.io</span>Code Tank</span></NuxtLink>
        <nav aria-label="Principal" class="nav__links">
          <a href="/#campagnes">Campagnes</a>
          <a href="/#jury">Jury</a>
          <NuxtLink to="/charte">Charte</NuxtLink>
          <NuxtLink v-if="organisateur" to="/admin">Administration</NuxtLink>
        </nav>
        <NuxtLink class="btn btn--primary" to="/compte">{{ connecte ? 'Mon compte' : 'Créer mon compte' }}</NuxtLink>
      </div>
    </header>
    <main id="contenu" tabindex="-1"><NuxtLayout><NuxtPage /></NuxtLayout></main>
    <footer class="footer">
      <div class="wrap footer__bar">
        <div class="footer__marque">
          <NuxtLink class="logo" to="/" aria-label="Code Tank by ybdn.io, accueil"><MascottePixel jure="boss" /><span class="logo__nom" aria-hidden="true"><span class="logo__par">ybdn.io</span>Code Tank</span></NuxtLink>
          <p>Le concours de code jugé par ybdn et ses agents. Code source sous licence AGPL-3.0.</p>
        </div>
        <nav aria-label="Informations légales" class="legal-links">
          <NuxtLink to="/charte">Charte</NuxtLink>
          <NuxtLink to="/confidentialite">Confidentialité</NuxtLink>
          <NuxtLink to="/mentions-legales">Mentions légales</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
