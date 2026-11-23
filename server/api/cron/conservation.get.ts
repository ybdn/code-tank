// Appelée une fois par jour par le planificateur de l'hébergeur (vercel.json). Réponse et journal : des compteurs et des codes
// d'erreur, jamais une donnée personnelle.
export default defineEventHandler(async (event) => {
  verifierCron(event)
  const bilan = await conserver(event)
  console.info('Conservation :', JSON.stringify(bilan))
  return bilan
})
