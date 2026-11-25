// Campagne du Boss : 404 pour tout autre compte et pour le visiteur.
export default defineEventHandler(async (event) => (await campagneDuBoss(event)).campagne)
