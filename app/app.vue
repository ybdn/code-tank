<script setup lang="ts">
const organisateur = useOrganisateur()
const user = useSupabaseUser()
</script>

<template>
  <div>
    <a class="skip" href="#contenu">Aller au contenu</a>
    <header class="nav">
      <div class="wrap nav__bar">
        <NuxtLink class="logo" to="/"><MascottePixel jure="sudo" /><span>Code Tank <span class="logo__par">by ybdn.io</span></span></NuxtLink>
        <nav aria-label="Principal" class="nav__links">
          <a href="/#campagnes">Campagnes</a>
          <a href="/#jury">Jury</a>
          <NuxtLink to="/charte">Charte</NuxtLink>
          <NuxtLink v-if="organisateur" to="/admin">Administration</NuxtLink>
        </nav>
        <NuxtLink class="btn btn--primary" to="/compte">{{ user ? 'Mon compte' : 'Créer mon compte' }}</NuxtLink>
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
