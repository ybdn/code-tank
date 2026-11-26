// Dépôt (story 3.3) : ce que la page lit de sa réception et de son dépôt, et le contrôle du fichier avant l'envoi.
// motifs : { code, message } posés par prive au refus (refuser_reception, story 3.4) ; la page affiche le message. Du dépôt
// accepté, ce que le candidat voit (SPECS § 4) : fichiers retenus et exclus, tokens estimés, empreinte ; jamais les alertes.
export type ReceptionLue = { statut: 'en_attente' | 'refusee'; motifs: { code: string; message: string }[] | null; presentation: string; demande: string | null; cree_le: string }
export type DepotLu = {
  presentation: string; demande: string | null; depose_le: string
  sha256: string; nb_fichiers: number; nb_tokens_estime: number
  /** Lue seulement par la page de dépôt (`?exclus=1`). */
  fichiers_exclus?: { chemin: string; raison: string }[]
}

// Raisons d'exclusion posées par prive (depot-controles, raisonExclusion), en mots pour la page de dépôt.
export const RAISONS_EXCLUSION: Record<string, string> = {
  lien_symbolique: 'lien symbolique', dossier_exclu: 'dossier exclu', verrouillage: 'fichier de verrouillage', image: 'image',
  media: 'média', binaire: 'binaire', trop_gros: 'plus de 1 Mo',
}

// Même plafond que le bucket depots, qui fait foi : ce contrôle évite seulement d'envoyer 20 Mo voués au refus.
export const TAILLE_MAX_ZIP = 20 * 1024 * 1024
export function validerFichier(f: { name: string; size: number } | null | undefined): string {
  if (!f) return 'Choisis l\'archive .zip de ton projet.'
  if (!f.name.toLowerCase().endsWith('.zip')) return 'Le fichier doit être une archive .zip.'
  if (f.size === 0) return 'Ce fichier est vide.'
  if (f.size > TAILLE_MAX_ZIP) return 'L\'archive fait plus de 20 Mo.'
  return ''
}
