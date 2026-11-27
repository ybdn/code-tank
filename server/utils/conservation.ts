import { timingSafeEqual, createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { SECRET_MIN } from './secret'

// Secret du planificateur (CRON_SECRET, le nom que l'hébergeur envoie), comparé en temps constant. Sinon : 404.
export function verifierCron(event: H3Event) {
  const secret = process.env.CRON_SECRET ?? ''
  const recu = getRequestHeader(event, 'authorization') ?? ''
  const h = (v: string) => createHash('sha256').update(v).digest()
  if (secret.length < SECRET_MIN || !timingSafeEqual(h(recu), h(`Bearer ${secret}`))) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
}
