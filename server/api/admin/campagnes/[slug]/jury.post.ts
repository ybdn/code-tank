// « Relancer le jury » : un passage du jury (réceptions en attente, clôture, lots). Un appel par minute au plus (PLAFONDS.jury).
export default defineEventHandler(async (event) => {
  await campagneDe(event) // 404 si le slug n'existe pas
  await limiter(event, 'jury')
  const { etat } = await appelerJury(event, 'bouton')
  return { etat }
})
