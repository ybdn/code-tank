// Validation de la déclaration de dépôt (SPECS § 4), partagée par le formulaire (aide à la saisie) et
// le serveur (qui fait foi). Les bornes reprennent les contraintes de la table reception.
export type TypeCode = 'open_source' | 'proprietaire'
export type ChampDepot = 'fichier' | 'presentation' | 'demande' | 'type_code' | 'declaration_code' | 'outils_ia'
export type ErreursDepot = Partial<Record<ChampDepot, string>>
export type Declaration = {
  presentation: string
  demande: string | null
  type_code: TypeCode
  outils_ia: string[]
  contact_reutilisation: boolean
}

export const TAILLE_MAX_ZIP = 20 * 1024 * 1024
const MAX_OUTILS = 10
const MAX_NOM_OUTIL = 50

const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// « Claude Code, Copilot » ou un nom par ligne.
export const listerOutils = (saisie: string) => saisie.split(/[,\n]/).map((o) => o.trim()).filter(Boolean)

// Contrôle indicatif côté navigateur : la limite du bucket fait foi.
export function validerFichier(f: { name: string; size: number } | null | undefined): string | undefined {
  if (!f) return 'Choisis l\'archive .zip de ton projet.'
  if (!f.name.toLowerCase().endsWith('.zip')) return 'Le fichier doit être une archive .zip.'
  if (f.size === 0) return 'Ce fichier est vide.'
  if (f.size > TAILLE_MAX_ZIP) return 'L\'archive fait plus de 20 Mo.'
}

// Corps attendu : presentation, demande, type_code, declaration_code (true), aucun_outil, outils_ia (tableau),
// contact_reutilisation. Tout autre champ est ignoré.
export function validerDeclaration(corps: Record<string, unknown>): { declaration: Declaration; erreurs: ErreursDepot } {
  const erreurs: ErreursDepot = {}
  const presentation = texte(corps.presentation)
  if (presentation.length < 1 || presentation.length > 500) erreurs.presentation = 'La présentation fait entre 1 et 500 caractères.'
  const demande = texte(corps.demande)
  if (demande.length > 80) erreurs.demande = 'La demande fait 80 caractères au plus.'
  const type_code = corps.type_code === 'open_source' || corps.type_code === 'proprietaire' ? corps.type_code : undefined
  if (!type_code) erreurs.type_code = 'Indique si ton code est open source ou propriétaire.'
  if (corps.declaration_code !== true) {
    erreurs.declaration_code = 'Coche la déclaration\u00a0: sans elle, ce code ne peut pas être déposé.'
  }

  const brut = Array.isArray(corps.outils_ia) ? corps.outils_ia : []
  const outils = brut.map(texte).filter(Boolean)
  if (outils.length > MAX_OUTILS || outils.some((o) => o.length > MAX_NOM_OUTIL)) {
    erreurs.outils_ia = `Dix outils au plus, ${MAX_NOM_OUTIL} caractères chacun.`
  } else if (corps.aucun_outil === true && outils.length) {
    erreurs.outils_ia = 'Tu as coché «\u00a0aucun\u00a0» et listé des outils\u00a0: garde l\'un ou l\'autre.'
  } else if (corps.aucun_outil !== true && !outils.length) {
    erreurs.outils_ia = 'Liste les outils d\'IA utilisés, ou coche «\u00a0aucun\u00a0».'
  }

  return {
    declaration: {
      presentation,
      demande: demande || null,
      type_code: type_code ?? 'open_source',
      outils_ia: outils,
      contact_reutilisation: corps.contact_reutilisation === true,
    },
    erreurs,
  }
}
