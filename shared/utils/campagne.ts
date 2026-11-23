export type Critere = { cle: string; libelle: string; poids: number; jure: string }
export type Campagne = {
  id: string; slug: string; titre: string; theme: string; brief: string; criteres: Critere[]; statut: string
  ouverture_inscriptions: string; cloture_depot: string; date_resultats: string; max_participants: number
}
export type CampagneListee = Pick<Campagne, 'slug' | 'titre' | 'theme' | 'statut' | 'cloture_depot'>

// Le statut « prête » ne se distingue pas de la délibération pour le public : rien n'est encore visible.
export const LIBELLE_STATUT: Record<string, string> = {
  inscriptions: 'Inscriptions ouvertes',
  depot: 'Dépôt ouvert',
  deliberation: 'Le jury délibère',
  prete: 'Le jury délibère',
  publiee: 'Résultats publiés',
  archivee: 'Campagne archivée',
}

const format = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })
export const formaterDate = (iso: string) => format.format(new Date(iso))

// Le dépôt est ouvert avant la clôture pendant les phases « inscriptions » et « dépôt » (elles se chevauchent).
export const depotOuvert = (c: { statut: string; cloture_depot: string }, maintenant = Date.now()) =>
  ['inscriptions', 'depot'].includes(c.statut) && maintenant < Date.parse(c.cloture_depot)
