import type { H3Event } from 'h3'
import { serverSupabaseClient } from '#supabase/server'

// Routes du Boss (story 2.1) : lecture sous le JWT (RLS : le Boss ne lit que ses campagnes), écriture par les RPC qui
// revérifient tout (AD-1).

// Erreur d'une RPC de campagne vers HTTP : CT404 (campagne absente ou appelant qui n'en est pas le Boss) en 404, P0001
// (règle métier, message fixe écrit par la fonction, jamais une valeur reçue) en 409, le reste en 500 sans détail.
export function erreurCampagne(error: { code: string; message: string }, contexte: string, message: string): never {
  if (error.code === 'CT404') throw createError({ statusCode: 404, message: 'Campagne introuvable.' })
  if (error.code === 'P0001') throw createError({ statusCode: 409, message: error.message })
  console.error(contexte, error.code)
  throw createError({ statusCode: 500, message })
}

export const COLONNES_CAMPAGNE = 'id, slug, titre, theme, brief, langages, visibilite, role_boss, max_participants, ouverture_inscriptions, cloture_depot, date_resultats, statut, regles_figees_le, bloquee_le, cree_le'

// Un slug hors de la forme imposée par la table (caractère nul, UTF-8 invalide…) ne peut désigner aucune campagne : 404
// tout de suite, plutôt qu'une erreur de la base en 500.
export function slugDeLaRoute(event: H3Event) {
  const slug = getRouterParam(event, 'slug', { decode: true }) ?? ''
  if (slug.length > 60 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw createError({ statusCode: 404, message: 'Campagne introuvable.' })
  return slug
}

// La campagne de l'adresse, si l'appelant en est le Boss. Sans session, ou pour tout autre compte : 404 (ressource hors droits).
export async function campagneDuBoss(event: H3Event) {
  const slug = slugDeLaRoute(event)
  const client = await serverSupabaseClient(event)
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw createError({ statusCode: 404, message: 'Campagne introuvable.' })
  const { data, error } = await client.from('campagne').select(COLONNES_CAMPAGNE).eq('slug', slug).maybeSingle()
  if (error) erreurCampagne(error, 'Lecture d\'une campagne :', 'La campagne ne peut pas être lue pour le moment.')
  if (!data) throw createError({ statusCode: 404, message: 'Campagne introuvable.' })
  return { client, campagne: data }
}

// Réglages du corps JSON, dans la forme des paramètres de creer_campagne et modifier_campagne. Une valeur du mauvais type
// devient vide ou nulle : la fonction SQL la refuse avec son message.
export async function reglagesDuCorps(event: H3Event) {
  exigerJson(event)
  const c = await readBody(event).catch(() => null) ?? {}
  // Postgres refuse le caractère nul et une demi-paire UTF-16 (22P05, 22P02 : un 500) : retirés ou remplacés ici.
  const texte = (v: unknown) => (typeof v === 'string' ? v.replaceAll('\u0000', '').toWellFormed() : '')
  // Hors bornes raisonnables, la base lèverait une erreur de type (22003, 22007), donc un 500 : la valeur devient vide et la
  // fonction répond 409 avec son message.
  // shortcut: années bornées à 2000-2100, comme verifier_reglages ; à élargir des deux côtés avant 2100.
  const date = (v: unknown) => {
    const t = typeof v === 'string' ? Date.parse(v) : NaN
    const annee = new Date(t).getUTCFullYear()
    return annee >= 2000 && annee <= 2100 ? new Date(t).toISOString() : null
  }
  return {
    p_titre: texte(c.titre),
    p_theme: texte(c.theme),
    p_brief: texte(c.brief),
    p_langages: Array.isArray(c.langages) ? c.langages.map(texte) : [],
    p_visibilite: texte(c.visibilite),
    p_role_boss: texte(c.role_boss),
    // shortcut: borne 0-1000 contre le dépassement d'integer, bien au-delà du plafond de 10 places tenu par la base.
    p_max_participants: Number.isSafeInteger(c.max_participants) && c.max_participants >= 0 && c.max_participants <= 1000 ? c.max_participants as number : 0,
    p_ouverture_inscriptions: date(c.ouverture_inscriptions)!,
    p_cloture_depot: date(c.cloture_depot)!,
    p_date_resultats: date(c.date_resultats)!,
  }
}
