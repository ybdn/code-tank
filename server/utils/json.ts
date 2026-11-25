import type { H3Event } from 'h3'

// Routes d'écriture (POST, PATCH, DELETE) : JSON seulement. Un formulaire d'un autre site (CSRF, sous-domaines compris) ne peut pas l'envoyer sans
// requête préalable CORS.
export function exigerJson(event: H3Event) {
  if (getRequestHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw createError({ statusCode: 415, message: 'Envoie le formulaire au format JSON.' })
  }
}
