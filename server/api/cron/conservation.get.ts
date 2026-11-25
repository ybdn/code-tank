// Appelée une fois par jour par le planificateur de l'hébergeur (vercel.json). Les tâches de conservation reviendront avec
// le schéma qu'elles purgent ; d'ici là, rien à faire. Réponse : des compteurs, jamais une donnée personnelle.
export default defineEventHandler((event) => {
  verifierCron(event)
  return {}
})
