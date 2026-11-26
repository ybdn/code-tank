// Appelée une fois par jour par le planificateur de l'hébergeur (vercel.json). Les tâches de conservation reviendront avec
// le schéma qu'elles purgent (epic 6). Elle déclenche aussi le jury, filet d'AD-7 si un appel après dépôt s'est perdu ; sans
// attendre sa réponse ni échouer avec lui (appelerJury ne lève jamais). Réponse : des compteurs, jamais une donnée personnelle.
export default defineEventHandler((event) => {
  verifierCron(event)
  event.waitUntil(appelerJury(event, 'cron'))
  return {}
})
