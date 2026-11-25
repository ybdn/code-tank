<script setup lang="ts">
const user = useSupabaseUser()
const connecterGithub = useConnexionGithub()
// Le serveur ne voit pas toujours la session au rendu : le bouton ne change qu'après le montage, sans écart d'hydratation.
const connecte = ref(false)
// Le bouton de connexion n'agit qu'une fois la page montée (comme celui de /compte).
const monte = ref(false)
onMounted(() => {
  monte.value = true
  watchEffect(() => (connecte.value = Boolean(user.value)))
})
// En cas d'échec, la page /compte affiche son message fixe et propose de nouveau la connexion.
const connecter = async () => (await connecterGithub()).error && navigateTo('/compte?error=1')
</script>

<template>
  <div class="site">
    <a class="skip" href="#contenu">Aller au contenu</a>
    <header class="nav">
      <div class="wrap nav__bar">
        <NuxtLink class="logo" to="/" aria-label="Code Tank by ybdn.io, accueil"><MascottePixel jure="boss" /><span class="logo__nom" aria-hidden="true"><span class="logo__par">ybdn.io</span>Code Tank</span></NuxtLink>
        <nav aria-label="Principal" class="nav__links">
          <a href="/#jury">Jury</a>
          <NuxtLink to="/charte">Charte</NuxtLink>
        </nav>
        <NuxtLink v-if="connecte" class="btn btn--primary" to="/compte">Mon compte</NuxtLink>
        <button v-else class="btn btn--primary" type="button" :disabled="!monte" @click="connecter">Se connecter avec GitHub</button>
      </div>
    </header>
    <main id="contenu" tabindex="-1"><NuxtPage /></main>
    <footer class="footer">
      <div class="wrap footer__bar">
        <div class="footer__marque">
          <NuxtLink class="logo" to="/" aria-label="Code Tank by ybdn.io, accueil"><MascottePixel jure="boss" /><span class="logo__nom" aria-hidden="true"><span class="logo__par">ybdn.io</span>Code Tank</span></NuxtLink>
          <p>Tu penses savoir coder&nbsp;? Affronte notre jury. Code source sous licence AGPL-3.0.</p>
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
