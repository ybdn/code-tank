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
