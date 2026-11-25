// Dépôt (story 3.3) : ce que la page lit de sa réception et de son dépôt, et le contrôle du fichier avant l'envoi.
// motifs : { code, message } posés par prive au refus (story 3.4), affichés tels quels.
export type ReceptionLue = { statut: 'en_attente' | 'refusee'; motifs: { code?: string; message?: string }[] | null; presentation: string; demande: string | null; cree_le: string }
export type DepotLu = { presentation: string; demande: string | null; depose_le: string }

// Même plafond que le bucket depots, qui fait foi : ce contrôle évite seulement d'envoyer 20 Mo voués au refus.
export const TAILLE_MAX_ZIP = 20 * 1024 * 1024
export function validerFichier(f: { name: string; size: number } | null | undefined): string {
  if (!f) return 'Choisis l\'archive .zip de ton projet.'
  if (!f.name.toLowerCase().endsWith('.zip')) return 'Le fichier doit être une archive .zip.'
  if (f.size === 0) return 'Ce fichier est vide.'
  if (f.size > TAILLE_MAX_ZIP) return 'L\'archive fait plus de 20 Mo.'
  return ''
}
