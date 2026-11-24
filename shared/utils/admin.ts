// Administration (SPECS §§ 3, 5, 6, 7) : validation partagée par les formulaires (aide à la saisie) et par le
// serveur (qui fait foi), étapes du cycle, fuseau des dates et types des réponses de l'API.
import type { Critere } from './campagne'

export const JURES = ['sudo', 'refacto', 'lint', 'pitch'] as const
export const NOM_JURE: Record<string, string> = { sudo: 'Sudo', refacto: 'Refacto', lint: 'Lint', pitch: 'Pitch' }

// Modèles Claude proposés pour les jurés (la base n'admet que ceux-ci). Coûts relatifs d'après les tarifs d'entrée / sortie
// par million de tokens : Opus 4 $ / 20 $, Sonnet 2 $ / 10 $, Haiku 0,10 $ / 0,50 $ (jusqu'à 100 000 tokens de prompt).
export const MODELES = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const
export type ModeleJure = (typeof MODELES)[number]
export const MODELE_PAR_DEFAUT: ModeleJure = 'claude-sonnet-5-5'
export const LIBELLE_MODELE: Record<ModeleJure, string> = {
  'claude-opus-5-5': 'Opus : le plus cher',
  'claude-sonnet-5-5': 'Sonnet : coût moyen, par défaut',
  'claude-haiku-5-5': 'Haiku : le moins cher, analyse plus légère',
}
export type ModelesJures = Record<(typeof JURES)[number], ModeleJure>
export const MODELES_PAR_DEFAUT: ModelesJures = { sudo: MODELE_PAR_DEFAUT, refacto: MODELE_PAR_DEFAUT, lint: MODELE_PAR_DEFAUT, pitch: MODELE_PAR_DEFAUT }

export type CritereAdmin = Critere & { calcule?: true }

// Critères par défaut du § 5 : total 100, dont 10 calculés par script (la note vient du scan de faits, pas de Claude).
export const CRITERES_PAR_DEFAUT: CritereAdmin[] = [
  { cle: 'securite', libelle: 'Sécurité', poids: 15, jure: 'sudo' },
  { cle: 'erreurs', libelle: 'Gestion des erreurs et cas limites', poids: 10, jure: 'sudo' },
  { cle: 'structure', libelle: 'Structure et découpage', poids: 15, jure: 'refacto' },
  { cle: 'lisibilite', libelle: 'Lisibilité et nommage', poids: 10, jure: 'refacto' },
  { cle: 'tests', libelle: 'Tests', poids: 15, jure: 'lint' },
  { cle: 'outillage', libelle: 'Outillage et doc', poids: 10, jure: 'lint', calcule: true },
  { cle: 'brief', libelle: 'Réponse au brief', poids: 15, jure: 'pitch' },
  { cle: 'finition', libelle: 'Originalité et finition', poids: 10, jure: 'pitch' },
]

// Tout ce que le routeur de Vue ou Nitro peut ramener à /admin ou /api/admin : casse, pourcentages, barres doublées.
export function cheminAdmin(chemin: string) {
  let c = chemin.split('?')[0] ?? ''
  try {
    c = decodeURIComponent(c)
  } catch {
    return true // chemin mal formé : contrôlé comme l'administration, donc 404 pour qui n'est pas organisateur
  }
  return /^\/+(api\/+)?admin(\/|$)/i.test(c)
}

// --- Étapes du cycle d'une campagne ---------------------------------------------------------

export const ETAPES = ['brouillon', 'inscriptions', 'depot', 'deliberation', 'prete', 'publiee', 'archivee'] as const
export type Etape = (typeof ETAPES)[number]

export const STATUT_ADMIN: Record<string, string> = {
  brouillon: 'Brouillon',
  inscriptions: 'Inscriptions ouvertes',
  depot: 'Dépôt ouvert',
  deliberation: 'Délibération',
  prete: 'Prête (relecture)',
  publiee: 'Publiée',
  archivee: 'Archivée',
}

// Ce que déclenche le passage à l'étape suivante, dit tel quel dans la confirmation.
export const EFFET_ETAPE: Record<string, string> = {
  inscriptions: 'La campagne devient publique et les candidats autorisés peuvent s\'inscrire et déposer. Les poids des critères doivent totaliser 100.',
  depot: 'La campagne passe en phase de dépôt : inscriptions et dépôt restent ouverts jusqu\'à la clôture.',
  deliberation: 'Les dépôts, retraits et désinscriptions sont fermés. Le vote du Boss s\'ouvre. Ce site ne lance pas les audits Claude.',
  prete: 'Tu passes à la relecture des alertes et des répliques. Rien n\'est encore visible des candidats.',
  publiee: 'Les résultats, les entretiens, les rapports et le classement deviennent visibles. La base refuse tant qu\'un vote du Boss n\'est pas verrouillé. Un e-mail part une seule fois à chaque participant ayant un dépôt et une adresse vérifiée, sans aucun score.',
  archivee: 'La campagne passe en archivée. L\'effacement des archives n\'est pas automatisé par ce site.',
}

export const etapeSuivante = (statut: string): Etape | null => ETAPES[ETAPES.indexOf(statut as Etape) + 1] ?? null

// --- Fuseau : les dates se saisissent et s'affichent à l'heure de Paris -----------------------

const format = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
// « 2026-12-01T09:30 » : la valeur d'un champ datetime-local.
export const versChampLocal = (iso: string) => format.format(new Date(iso)).replace(' ', 'T')
// Inverse. Le décalage est recalculé à l'instant trouvé pour tomber juste autour du changement d'heure.
export function depuisChampLocal(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return ''
  const t = Date.parse(`${local}:00Z`)
  if (Number.isNaN(t)) return ''
  const decalage = (instant: number) => Date.parse(`${versChampLocal(new Date(instant).toISOString())}:00Z`) - instant
  return new Date(t - decalage(t - decalage(t))).toISOString()
}

// --- Campagne -----------------------------------------------------------------------------

export type ChampCampagne = 'slug' | 'titre' | 'theme' | 'brief' | 'criteres' | 'ouverture_inscriptions' | 'cloture_depot' | 'date_resultats' | 'max_participants' | 'modeles'
export type ErreursCampagne = Partial<Record<ChampCampagne, string>>
export type CorpsCampagne = {
  slug: string; titre: string; theme: string; brief: string; criteres: CritereAdmin[]
  ouverture_inscriptions: string; cloture_depot: string; date_resultats: string; max_participants: number
  // Absent du corps : la base garde le défaut à la création et la valeur actuelle à la modification.
  modeles?: ModelesJures
}

const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const MAX_PARTICIPANTS = 1000

// Les bornes de longueur et le plafond de participants sont de simples garde-fous : la base n'en pose pas.
export function validerCampagne(corps: Record<string, unknown>): { campagne: CorpsCampagne; erreurs: ErreursCampagne } {
  const e: ErreursCampagne = {}
  const slug = texte(corps.slug)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) e.slug = 'Le slug fait 60 caractères au plus : minuscules, chiffres et tirets (exemple : minuteur-de-pause).'
  const titre = texte(corps.titre)
  if (titre.length < 1 || titre.length > 120) e.titre = 'Le titre fait entre 1 et 120 caractères.'
  const theme = texte(corps.theme)
  if (theme.length < 1 || theme.length > 200) e.theme = 'Le thème fait entre 1 et 200 caractères.'
  const brief = texte(corps.brief)
  if (brief.length < 1 || brief.length > 5000) e.brief = 'Le brief fait entre 1 et 5 000 caractères.'

  const criteres: CritereAdmin[] = []
  const brut = Array.isArray(corps.criteres) ? corps.criteres : []
  const cles = new Set<string>()
  for (const c of brut as Record<string, unknown>[]) {
    const cle = texte(c?.cle)
    const libelle = texte(c?.libelle)
    const poids = c?.poids
    const jure = texte(c?.jure)
    if (!/^[a-z][a-z0-9_]{0,29}$/.test(cle) || cles.has(cle)) { e.criteres = 'Une clé de critère est invalide ou en double.'; break }
    cles.add(cle)
    if (libelle.length < 1 || libelle.length > 100) { e.criteres = 'Chaque critère a un libellé de 1 à 100 caractères.'; break }
    if (typeof poids !== 'number' || !Number.isInteger(poids) || poids < 0 || poids > 100) { e.criteres = 'Chaque poids est un entier de 0 à 100.'; break }
    if (!(JURES as readonly string[]).includes(jure)) { e.criteres = 'Chaque critère a un juré : Sudo, Refacto, Lint ou Pitch.'; break }
    criteres.push({ cle, libelle, poids, jure, ...(c.calcule === true ? { calcule: true as const } : {}) })
  }
  if (!e.criteres && (criteres.length < 1 || criteres.length > 12)) e.criteres = 'Une campagne a de 1 à 12 critères.'

  const date = (v: unknown) => {
    const t = typeof v === 'string' ? Date.parse(v) : NaN
    return Number.isNaN(t) ? null : t
  }
  const dates = { ouverture_inscriptions: date(corps.ouverture_inscriptions), cloture_depot: date(corps.cloture_depot), date_resultats: date(corps.date_resultats) }
  for (const [champ, t] of Object.entries(dates)) if (t === null) e[champ as ChampCampagne] = 'Indique une date et une heure.'
  const { ouverture_inscriptions: o, cloture_depot: c, date_resultats: r } = dates
  if (o !== null && c !== null && o >= c) e.cloture_depot = 'La clôture du dépôt suit l\'ouverture des inscriptions.'
  else if (c !== null && r !== null && c >= r) e.date_resultats = 'Les résultats suivent la clôture du dépôt.'

  const max = corps.max_participants
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > MAX_PARTICIPANTS) e.max_participants = `Le nombre de participants est un entier de 1 à ${MAX_PARTICIPANTS}.`

  let modeles: ModelesJures | undefined
  if (corps.modeles !== undefined) {
    const m = (corps.modeles && typeof corps.modeles === 'object' ? corps.modeles : {}) as Record<string, unknown>
    if (JURES.every((j) => (MODELES as readonly unknown[]).includes(m[j])) && Object.keys(m).length === JURES.length) modeles = m as ModelesJures
    else e.modeles = 'Choisis Opus, Sonnet ou Haiku pour chacun des quatre jurés.'
  }

  const iso = (t: number | null) => (t === null ? '' : new Date(t).toISOString())
  return {
    campagne: {
      slug, titre, theme, brief, criteres,
      ouverture_inscriptions: iso(o), cloture_depot: iso(c), date_resultats: iso(r), max_participants: typeof max === 'number' ? max : 0,
      ...(modeles ? { modeles } : {}),
    },
    erreurs: e,
  }
}

// --- Réglages -----------------------------------------------------------------------------

export type ErreursReglages = Partial<Record<'plafond_comptes' | 'plafond_depense_usd', string>>
export type CorpsReglages = { plafond_comptes: number | null; plafond_depense_usd: number }

// plafond_comptes nul = pas de plafond ; plafond_depense_usd : numeric(10, 2), strictement positif.
export function validerReglages(corps: Record<string, unknown>): { reglages: CorpsReglages; erreurs: ErreursReglages } {
  const erreurs: ErreursReglages = {}
  const p = corps.plafond_comptes
  const plafond = p === null || p === undefined || p === '' ? null : p
  if (plafond !== null && (typeof plafond !== 'number' || !Number.isInteger(plafond) || plafond < 0)) erreurs.plafond_comptes = 'Un entier de 0 ou plus, ou vide pour aucun plafond.'
  const d = corps.plafond_depense_usd
  if (typeof d !== 'number' || !(d > 0) || d >= 1e8 || Math.round(d * 100) !== d * 100) erreurs.plafond_depense_usd = 'Un montant en dollars supérieur à 0, avec deux décimales au plus.'
  return { reglages: { plafond_comptes: plafond as number | null, plafond_depense_usd: typeof d === 'number' ? d : 0 }, erreurs }
}

// --- Dépôt : traces d'outils d'IA et alertes ------------------------------------------------

// Forme écrite par le contrôle des zips (hors de ce dépôt) :
//   traces_ia        { outil, type, fichier, ligne?, occurrences, declaree }
//   alertes_integrite { type, fichier, ligne? }
// `declaree: false` veut dire « outil non couvert par la déclaration » : le contrôle gère lui-même les alias
// (claude/Anthropic, windsurf/Codeium, trace générique), on ne recompare jamais les noms ici.
export function contradictionsIa(traces: unknown): string[] {
  return (Array.isArray(traces) ? traces : [])
    .filter((t) => (t as { declaree?: unknown } | null)?.declaree === false)
    .map((t) => `Trace non couverte par la déclaration : ${libelleElement(t)}.`)
}

// Texte lisible d'une trace, d'une alerte ou d'un fichier exclu (jamais « [object Object] »).
export function libelleElement(a: unknown): string {
  if (typeof a === 'string') return a
  const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
  if (typeof o.message === 'string') return o.message
  const nom = [o.outil, o.type].filter((v) => typeof v === 'string' && v).join(' · ')
  const lieu = typeof o.fichier === 'string' ? `${o.fichier}${typeof o.ligne === 'number' ? `:${o.ligne}` : ''}` : ''
  if (!nom && !lieu) return JSON.stringify(a)
  const n = typeof o.occurrences === 'number' ? `, ${o.occurrences} occurrence${o.occurrences > 1 ? 's' : ''}` : ''
  return [nom, lieu].filter(Boolean).join(' : ') + n
}

// --- Types des réponses de l'API ------------------------------------------------------------

export type GithubDonnees = { login?: string; compte_cree_le?: string; depots_publics?: number; derniere_activite?: string | null; evenements_recents?: number; lu_le?: string } | null

export type CompteAdmin = {
  id: string; vrai_nom: string; pseudo: string; email_contact: string; email_verifie_le: string | null; motivation: string
  depot_cite_url: string; github_donnees: GithubDonnees; etat: string; etat_le: string; cree_le: string
}

export type ReceptionAdmin = {
  etat: 'en_attente' | 'acceptee' | 'refusee'; motifs_refus: { code?: string; message?: string }[]; recue_le: string; traitee_le: string | null
  presentation: string; demande: string | null; type_code: string; outils_ia: string[]
}

export type DepotAdmin = {
  id: string; sha256: string; taille_octets: number; nb_fichiers: number; fichiers_exclus: unknown[]; nb_tokens: number
  presentation: string; demande: string | null; type_code: string; licence_presente: boolean; outils_ia: string[]; traces_ia: unknown[]
  alerte_manipulation: boolean; alertes_integrite: unknown[]; depose_le: string; archive: boolean
}

export type AuditAdmin = {
  id: string; jure: string; modele: string; version_consignes: string; statut: string; resultat: AuditResultat | null
  replique_masquee: boolean; cout_usd: number | null; tentatives: number
}
export type AuditResultat = {
  criteres?: { cle?: string; note?: number; justification?: string; preuves?: { fichier?: string; ligne?: number; constat?: string }[] }[]
  points_forts?: string[]; a_ameliorer?: string[]; manipulation_detectee?: { detectee?: boolean; preuves?: unknown[] }; verdict?: string; replique?: string
}

export type DecisionAdmin = { id: string; type: string; justification: string; prise_le: string }

export type ParticipationAdmin = {
  id: string; compte_id: string | null; pseudo: string; vrai_nom: string; inscrit_le: string
  reception: ReceptionAdmin | null; depot: DepotAdmin | null
  vote: { note: number; commentaire: string | null; verrouille_le: string | null } | null
  // Absent tant que le vote du Boss n'est pas verrouillé (vote à l'aveugle).
  apres: { audits: AuditAdmin[]; contact_reutilisation: boolean | null; note_outillage: number | null } | null
  decisions: DecisionAdmin[]
}

export type CampagneAdmin = {
  id: string; slug: string; titre: string; theme: string; brief: string; criteres: CritereAdmin[]; statut: string
  ouverture_inscriptions: string; cloture_depot: string; date_resultats: string; max_participants: number; regles_figees_le: string | null
  modeles: ModelesJures
}

export type DetailCampagne = {
  campagne: CampagneAdmin
  participations: ParticipationAdmin[]
  candidats: { id: string; pseudo: string; vrai_nom: string }[]
}

// --- Tableau de bord ------------------------------------------------------------------------

export type CampagneTableau = {
  id: string; slug: string; titre: string; statut: string; ouverture_inscriptions: string; cloture_depot: string; date_resultats: string
  max_participants: number; inscrits: number; receptions_en_attente: number; receptions_refusees: number; depots: number; votes_verrouilles: number
}
export type TableauDeBord = {
  comptes: Record<string, number>; plafond_comptes: number | null; plafond_depense_usd: number; campagnes: CampagneTableau[]
}
export type Tache = { urgent: boolean; texte: string; lien: string }

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`

// Ce qui attend l'organisateur, déduit des chiffres et des dates ; les urgences d'abord. Rien n'est fait à sa place.
export function tachesAdmin(t: TableauDeBord, maintenant = Date.now()): Tache[] {
  const taches: Tache[] = []
  const verifies = t.comptes.verifie ?? 0
  if (verifies) taches.push({ urgent: true, texte: `${pluriel(verifies, 'compte vérifié attend', 'comptes vérifiés attendent')} ta décision.`, lien: '/admin/comptes?panneau=verifie' })
  const attente = t.comptes.liste_attente ?? 0
  if (attente) taches.push({ urgent: false, texte: `${pluriel(attente, 'compte est', 'comptes sont')} en liste d'attente.`, lien: '/admin/comptes?panneau=liste_attente' })

  for (const c of t.campagnes) {
    const page = `/admin/campagnes/${c.slug}`
    const passee = (iso: string) => Date.parse(iso) <= maintenant
    if (c.statut === 'brouillon' && passee(c.ouverture_inscriptions)) {
      taches.push({ urgent: true, texte: `${c.titre} : la date d'ouverture est passée, la campagne est encore en brouillon.`, lien: `${page}?panneau=etape` })
    }
    if ((c.statut === 'inscriptions' || c.statut === 'depot') && passee(c.cloture_depot)) {
      taches.push({ urgent: true, texte: `${c.titre} : le dépôt est clos, passe en délibération.`, lien: `${page}?panneau=etape` })
    }
    if (c.receptions_en_attente) {
      taches.push({ urgent: false, texte: `${c.titre} : ${pluriel(c.receptions_en_attente, 'envoi attend', 'envois attendent')} le contrôle du dépôt.`, lien: `${page}?panneau=depots` })
    }
    const aVoter = c.depots - c.votes_verrouilles
    if ((c.statut === 'deliberation' || c.statut === 'prete') && aVoter > 0) {
      taches.push({ urgent: true, texte: `${c.titre} : ${pluriel(aVoter, 'vote du Boss reste', 'votes du Boss restent')} à verrouiller.`, lien: `${page}?panneau=depots` })
    }
    if (c.statut === 'deliberation' && c.depots > 0 && aVoter === 0) {
      taches.push({ urgent: false, texte: `${c.titre} : tous les votes sont verrouillés, tu peux passer à la relecture.`, lien: `${page}?panneau=etape` })
    }
    if (c.statut === 'prete' && passee(c.date_resultats)) {
      taches.push({ urgent: true, texte: `${c.titre} : la date des résultats est passée, publie-les.`, lien: `${page}?panneau=etape` })
    }
  }
  return taches.sort((a, b) => Number(b.urgent) - Number(a.urgent))
}

// La prochaine date qui compte pour une campagne, selon son étape.
export function prochaineEcheance(c: CampagneTableau): { libelle: string; date: string } | null {
  if (c.statut === 'brouillon') return { libelle: 'Ouverture des inscriptions', date: c.ouverture_inscriptions }
  if (c.statut === 'inscriptions' || c.statut === 'depot') return { libelle: 'Clôture du dépôt', date: c.cloture_depot }
  if (c.statut === 'deliberation' || c.statut === 'prete') return { libelle: 'Résultats', date: c.date_resultats }
  return null
}
