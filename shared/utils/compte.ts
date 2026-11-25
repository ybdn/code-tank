// Version de la charte enregistrée avec chaque compte : affichée dans le formulaire, envoyée à la base par le serveur seul.
// À changer avec content/charte.md (annonce 30 jours avant, charte § 11).
export const VERSION_CHARTE = '2026-11-25'

// Forme d'un identifiant GitHub, la même que la contrainte de la table compte (aide à la saisie ; la base fait foi).
export const PSEUDO = /^[A-Za-z0-9_-]{3,39}$/
