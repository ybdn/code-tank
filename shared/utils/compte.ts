// Validation du profil, partagée par le formulaire (aide à la saisie) et le serveur (qui fait foi).
// Les bornes reprennent les contraintes de la table compte.
export type ChampProfil = 'vrai_nom' | 'pseudo' | 'email_contact' | 'motivation' | 'depot_cite_url'
export type ErreursProfil = Partial<Record<ChampProfil | 'charte' | 'majeur', string>>
export type Profil = Record<ChampProfil, string>

const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Ne garde que les champs du profil, nettoyés : tout le reste du corps est ignoré.
export function nettoyerProfil(corps: Record<string, unknown>): Profil {
  return {
    vrai_nom: texte(corps.vrai_nom),
    pseudo: texte(corps.pseudo),
    email_contact: texte(corps.email_contact).toLowerCase(),
    motivation: texte(corps.motivation),
    depot_cite_url: texte(corps.depot_cite_url),
  }
}

// Les champs absents de `champs` ne sont pas contrôlés (modification partielle).
export function validerProfil(p: Partial<Profil>): ErreursProfil {
  const e: ErreursProfil = {}
  if (p.vrai_nom !== undefined && (p.vrai_nom.length < 1 || p.vrai_nom.length > 100)) {
    e.vrai_nom = 'Indique ton vrai nom (100 caractères au plus).'
  }
  if (p.pseudo !== undefined) {
    if (p.pseudo.length < 2 || p.pseudo.length > 30) e.pseudo = 'Le pseudo fait entre 2 et 30 caractères.'
    else if (p.pseudo.toLowerCase() === 'candidat supprimé') e.pseudo = 'Ce pseudo est réservé.'
  }
  if (p.email_contact !== undefined && (!EMAIL.test(p.email_contact) || p.email_contact.length > 254)) {
    e.email_contact = 'Indique une adresse e-mail valide.'
  }
  if (p.motivation !== undefined) {
    const lignes = p.motivation.split('\n').filter((l) => l.trim()).length
    if (p.motivation.length < 1) e.motivation = 'Écris ta motivation.'
    else if (p.motivation.length > 1000) e.motivation = 'La motivation fait 1 000 caractères au plus.'
    else if (lignes > 3) e.motivation = 'Trois lignes au plus.'
  }
  if (p.depot_cite_url !== undefined) {
    let ok = p.depot_cite_url.length <= 300 && p.depot_cite_url.startsWith('https://')
    if (ok) {
      try {
        ok = Boolean(new URL(p.depot_cite_url).hostname)
      } catch {
        ok = false
      }
    }
    if (!ok) e.depot_cite_url = 'Indique le lien https:// d\'un projet à toi.'
  }
  return e
}

export function validerCreation(corps: Record<string, unknown>): { profil: Profil; erreurs: ErreursProfil } {
  const profil = nettoyerProfil(corps)
  const erreurs = validerProfil(profil)
  if (corps.charte !== true) erreurs.charte = 'Accepte la charte pour créer ton compte.'
  if (corps.majeur !== true) erreurs.majeur = 'Il faut avoir 18 ans ou plus.'
  return { profil, erreurs }
}
