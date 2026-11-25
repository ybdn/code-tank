// Ce que le public voit du cycle : « prête » reste la délibération, « archivée » garde ses résultats.
export const ETAPES_PUBLIQUES = ['inscriptions', 'depot', 'deliberation', 'publiee'] as const
export const LIBELLE_ETAPE_PUBLIQUE: Record<string, string> = { inscriptions: 'Inscriptions', depot: 'Dépôt', deliberation: 'Délibération', publiee: 'Résultats' }
export const etapePublique = (statut: string) => ({ prete: 'deliberation', archivee: 'publiee' } as Record<string, string>)[statut] ?? statut
