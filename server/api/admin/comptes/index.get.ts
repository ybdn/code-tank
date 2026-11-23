// Tous les candidats avec ce qui aide à décider (SPECS § 3), lus par la session de l'organisateur.
export default defineEventHandler(async (event) => {
  const { client } = contexteAdmin(event)
  const [comptes, reglage] = await Promise.all([
    client.from('compte')
      .select('id, vrai_nom, pseudo, email_contact, email_verifie_le, motivation, depot_cite_url, github_donnees, etat, etat_le, cree_le')
      .eq('role', 'candidat').order('cree_le'),
    client.from('reglage').select('plafond_comptes').single(),
  ])
  return { plafond: lu(reglage, 'du réglage').plafond_comptes, comptes: lu(comptes, 'des comptes') as CompteAdmin[] }
})
