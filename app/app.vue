<script setup lang="ts">
const organisateur = useOrganisateur()
const user = useSupabaseUser()
// Le serveur ne voit pas toujours la session au rendu : le libellé ne change qu'après le montage, sans écart d'hydratation.
const connecte = ref(false)
onMounted(() => watchEffect(() => (connecte.value = Boolean(user.value))))
</script>

<template>
  <div>
    <a class="skip" href="#contenu">Aller au contenu</a>
    <header class="nav">
      <div class="wrap nav__bar">
        <NuxtLink class="logo" to="/"><MascottePixel jure="sudo" /><span class="logo__nom">Code Tank <span class="logo__par">by ybdn.io</span></span></NuxtLink>
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
        <p>Code Tank by ybdn.io, le concours de code jugé par Claude. Code source sous licence AGPL-3.0.</p>
        <nav aria-label="Informations légales" class="legal-links">
          <NuxtLink to="/charte">Charte</NuxtLink>
          <NuxtLink to="/confidentialite">Confidentialité</NuxtLink>
          <NuxtLink to="/mentions-legales">Mentions légales</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
