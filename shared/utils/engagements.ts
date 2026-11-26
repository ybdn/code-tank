// Engagements du Boss au lancement de la délibération (story 4.3, SPECS § 6) : les trois phrases affichées par la page, et leur
// version, enregistrée avec la date dans `engagement`. Changer une phrase change la version.
export const ENGAGEMENTS_VERSION = '2026-11-26'
export const ENGAGEMENTS = [
  'Cette clé est une clé API commerciale à moi, que je confie à Code Tank en connaissance de cause, et je réponds de toute l\'activité de mon compte.',
  'Mon organisation n\'a pas rejoint le « Development Partner Program » (« Development Partner Mode » dans les Service Specific Terms).',
  'Je ne garde ni ne diffuse le code des candidats.',
] as const
// Bornes du plafond, en dollars : la même que la base (campagne.plafond_usd).
export const PLAFOND_MAX_USD = 10000
