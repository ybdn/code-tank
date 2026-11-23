
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit": {
                  Row: {
                    "batch_id": string | null,"cout_usd": number | null,"depot_id": string,"id": string,"jure": string,"modele": string,"replique_masquee": boolean,"resultat": Json | null,"statut": Database["public"]['Enums']["audit_statut"],"tentatives": number,"usage": Json | null,"version_consignes": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"cout_usd"?: number | null,"depot_id": string,"id"?: string,"jure": string,"modele": string,"replique_masquee"?: boolean,"resultat"?: Json | null,"statut"?: Database["public"]['Enums']["audit_statut"],"tentatives"?: number,"usage"?: Json | null,"version_consignes": string
                  }
                  Update: {
                    "batch_id"?: string | null,"cout_usd"?: number | null,"depot_id"?: string,"id"?: string,"jure"?: string,"modele"?: string,"replique_masquee"?: boolean,"resultat"?: Json | null,"statut"?: Database["public"]['Enums']["audit_statut"],"tentatives"?: number,"usage"?: Json | null,"version_consignes"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_depot_id_fkey"
      columns: ["depot_id"]
isOneToOne: false
      referencedRelation: "depot"
      referencedColumns: ["id"]
    }
                  ]
                },"campagne": {
                  Row: {
                    "brief": string,"cloture_depot": string,"criteres": NonNullable<Json>,"date_resultats": string,"id": string,"max_participants": number,"ouverture_inscriptions": string,"publiee_le": string | null,"regles_figees_le": string | null,"slug": string,"statut": Database["public"]['Enums']["campagne_statut"],"theme": string,"titre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brief": string,"cloture_depot": string,"criteres": NonNullable<Json>,"date_resultats": string,"id"?: string,"max_participants": number,"ouverture_inscriptions": string,"publiee_le"?: string | null,"regles_figees_le"?: string | null,"slug": string,"statut"?: Database["public"]['Enums']["campagne_statut"],"theme": string,"titre": string
                  }
                  Update: {
                    "brief"?: string,"cloture_depot"?: string,"criteres"?: NonNullable<Json>,"date_resultats"?: string,"id"?: string,"max_participants"?: number,"ouverture_inscriptions"?: string,"publiee_le"?: string | null,"regles_figees_le"?: string | null,"slug"?: string,"statut"?: Database["public"]['Enums']["campagne_statut"],"theme"?: string,"titre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"compte": {
                  Row: {
                    "attente_demandee_le": string | null,"charte_acceptee_le": string,"confirme_attente_le": string | null,"cree_le": string,"depot_cite_url": string,"derniere_connexion_le": string,"email_contact": string,"email_verifie_le": string | null,"etat": Database["public"]['Enums']["compte_etat"],"etat_le": string,"github_donnees": Json | null,"github_id": string,"id": string,"majeur_declare_le": string,"motivation": string,"prevenu_inactivite_le": string | null,"pseudo": string,"role": Database["public"]['Enums']["compte_role"],"version_charte": string,"vrai_nom": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attente_demandee_le"?: string | null,"charte_acceptee_le": string,"confirme_attente_le"?: string | null,"cree_le"?: string,"depot_cite_url": string,"derniere_connexion_le"?: string,"email_contact": string,"email_verifie_le"?: string | null,"etat"?: Database["public"]['Enums']["compte_etat"],"etat_le"?: string,"github_donnees"?: Json | null,"github_id": string,"id": string,"majeur_declare_le": string,"motivation": string,"prevenu_inactivite_le"?: string | null,"pseudo": string,"role"?: Database["public"]['Enums']["compte_role"],"version_charte": string,"vrai_nom": string
                  }
                  Update: {
                    "attente_demandee_le"?: string | null,"charte_acceptee_le"?: string,"confirme_attente_le"?: string | null,"cree_le"?: string,"depot_cite_url"?: string,"derniere_connexion_le"?: string,"email_contact"?: string,"email_verifie_le"?: string | null,"etat"?: Database["public"]['Enums']["compte_etat"],"etat_le"?: string,"github_donnees"?: Json | null,"github_id"?: string,"id"?: string,"majeur_declare_le"?: string,"motivation"?: string,"prevenu_inactivite_le"?: string | null,"pseudo"?: string,"role"?: Database["public"]['Enums']["compte_role"],"version_charte"?: string,"vrai_nom"?: string
                  }
                  Relationships: [
                    
                  ]
                },"debit": {
                  Row: {
                    "action": string,"empreinte": string,"le": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"empreinte": string,"le"?: string
                  }
                  Update: {
                    "action"?: string,"empreinte"?: string,"le"?: string
                  }
                  Relationships: [
                    
                  ]
                },"decision": {
                  Row: {
                    "campagne_id": string,"id": string,"justification": string,"participation_id": string,"prise_le": string,"type": Database["public"]['Enums']["decision_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "campagne_id": string,"id"?: string,"justification": string,"participation_id": string,"prise_le"?: string,"type": Database["public"]['Enums']["decision_type"]
                  }
                  Update: {
                    "campagne_id"?: string,"id"?: string,"justification"?: string,"participation_id"?: string,"prise_le"?: string,"type"?: Database["public"]['Enums']["decision_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "decision_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decision_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "classement"
      referencedColumns: ["campagne_id"]
    },{
      foreignKeyName: "decision_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "places_campagne"
      referencedColumns: ["campagne_id"]
    },{
      foreignKeyName: "decision_participation_id_fkey"
      columns: ["participation_id"]
isOneToOne: false
      referencedRelation: "participation"
      referencedColumns: ["id"]
    }
                  ]
                },"depot": {
                  Row: {
                    "alerte_manipulation": boolean,"alertes_integrite": NonNullable<Json>,"chemin_stockage": string | null,"contact_reutilisation": boolean,"declaration_code_le": string,"demande": string | null,"depose_le": string,"faits": Json | null,"fichiers_exclus": NonNullable<Json>,"id": string,"licence_presente": boolean,"nb_fichiers": number,"nb_tokens": number,"note_outillage": number | null,"outils_ia": NonNullable<Json>,"participation_id": string,"presentation": string,"sha256": string,"taille_octets": number,"traces_ia": NonNullable<Json>,"type_code": Database["public"]['Enums']["type_code"]
                  }
                  ComputedFields: never
                  Insert: {
                    "alerte_manipulation"?: boolean,"alertes_integrite"?: NonNullable<Json>,"chemin_stockage"?: string | null,"contact_reutilisation"?: boolean,"declaration_code_le": string,"demande"?: string | null,"depose_le"?: string,"faits"?: Json | null,"fichiers_exclus"?: NonNullable<Json>,"id"?: string,"licence_presente": boolean,"nb_fichiers": number,"nb_tokens": number,"note_outillage"?: number | null,"outils_ia"?: NonNullable<Json>,"participation_id": string,"presentation": string,"sha256": string,"taille_octets": number,"traces_ia"?: NonNullable<Json>,"type_code": Database["public"]['Enums']["type_code"]
                  }
                  Update: {
                    "alerte_manipulation"?: boolean,"alertes_integrite"?: NonNullable<Json>,"chemin_stockage"?: string | null,"contact_reutilisation"?: boolean,"declaration_code_le"?: string,"demande"?: string | null,"depose_le"?: string,"faits"?: Json | null,"fichiers_exclus"?: NonNullable<Json>,"id"?: string,"licence_presente"?: boolean,"nb_fichiers"?: number,"nb_tokens"?: number,"note_outillage"?: number | null,"outils_ia"?: NonNullable<Json>,"participation_id"?: string,"presentation"?: string,"sha256"?: string,"taille_octets"?: number,"traces_ia"?: NonNullable<Json>,"type_code"?: Database["public"]['Enums']["type_code"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "depot_participation_id_fkey"
      columns: ["participation_id"]
isOneToOne: true
      referencedRelation: "participation"
      referencedColumns: ["id"]
    }
                  ]
                },"participation": {
                  Row: {
                    "campagne_id": string,"compte_id": string | null,"etat": Database["public"]['Enums']["participation_etat"],"id": string,"inscrit_le": string,"retire_le": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "campagne_id": string,"compte_id"?: string | null,"etat"?: Database["public"]['Enums']["participation_etat"],"id"?: string,"inscrit_le"?: string,"retire_le"?: string | null
                  }
                  Update: {
                    "campagne_id"?: string,"compte_id"?: string | null,"etat"?: Database["public"]['Enums']["participation_etat"],"id"?: string,"inscrit_le"?: string,"retire_le"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "participation_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participation_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "classement"
      referencedColumns: ["campagne_id"]
    },{
      foreignKeyName: "participation_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "places_campagne"
      referencedColumns: ["campagne_id"]
    },{
      foreignKeyName: "participation_compte_id_fkey"
      columns: ["compte_id"]
isOneToOne: false
      referencedRelation: "compte"
      referencedColumns: ["id"]
    }
                  ]
                },"reception": {
                  Row: {
                    "chemin_stockage": string,"contact_reutilisation": boolean,"declaration_code_le": string,"demande": string | null,"etat": Database["public"]['Enums']["reception_etat"],"id": string,"motifs_refus": NonNullable<Json>,"outils_ia": NonNullable<Json>,"participation_id": string,"presentation": string,"recue_le": string,"traitee_le": string | null,"type_code": Database["public"]['Enums']["type_code"]
                  }
                  ComputedFields: never
                  Insert: {
                    "chemin_stockage": string,"contact_reutilisation"?: boolean,"declaration_code_le": string,"demande"?: string | null,"etat"?: Database["public"]['Enums']["reception_etat"],"id"?: string,"motifs_refus"?: NonNullable<Json>,"outils_ia"?: NonNullable<Json>,"participation_id": string,"presentation": string,"recue_le"?: string,"traitee_le"?: string | null,"type_code": Database["public"]['Enums']["type_code"]
                  }
                  Update: {
                    "chemin_stockage"?: string,"contact_reutilisation"?: boolean,"declaration_code_le"?: string,"demande"?: string | null,"etat"?: Database["public"]['Enums']["reception_etat"],"id"?: string,"motifs_refus"?: NonNullable<Json>,"outils_ia"?: NonNullable<Json>,"participation_id"?: string,"presentation"?: string,"recue_le"?: string,"traitee_le"?: string | null,"type_code"?: Database["public"]['Enums']["type_code"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reception_participation_id_fkey"
      columns: ["participation_id"]
isOneToOne: true
      referencedRelation: "participation"
      referencedColumns: ["id"]
    }
                  ]
                },"reglage": {
                  Row: {
                    "plafond_comptes": number | null,"plafond_depense_usd": number
                  }
                  ComputedFields: never
                  Insert: {
                    "plafond_comptes"?: number | null,"plafond_depense_usd"?: number
                  }
                  Update: {
                    "plafond_comptes"?: number | null,"plafond_depense_usd"?: number
                  }
                  Relationships: [
                    
                  ]
                },"vote_boss": {
                  Row: {
                    "commentaire": string | null,"note": number,"participation_id": string,"verrouille_le": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "commentaire"?: string | null,"note": number,"participation_id": string,"verrouille_le"?: string | null
                  }
                  Update: {
                    "commentaire"?: string | null,"note"?: number,"participation_id"?: string,"verrouille_le"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vote_boss_participation_id_fkey"
      columns: ["participation_id"]
isOneToOne: true
      referencedRelation: "participation"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "classement": {
                  Row: {
                    "campagne_id": string,"disqualifie": boolean | null,"justification": string | null,"justification_departage": string | null,"note_boss": number | null,"notes": Json | null,"pseudo": string | null,"rang": number | null,"score_claude": number | null,"score_final": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"contact_reutilisation_lisible": {
                  Row: {
                    "contact_reutilisation": boolean,"participation_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "contact_reutilisation"?: boolean | null,"participation_id"?: string | null
                         }
                        Update: {
                           "contact_reutilisation"?: boolean | null,"participation_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "depot_participation_id_fkey"
      columns: ["participation_id"]
isOneToOne: true
      referencedRelation: "participation"
      referencedColumns: ["id"]
    }
                  ]
                },"ma_reception": {
                  Row: {
                    "contact_reutilisation": boolean,"declaration_code_le": string,"demande": string | null,"etat": Database["public"]['Enums']["reception_etat"],"motifs_refus": NonNullable<Json>,"outils_ia": NonNullable<Json>,"participation_id": string,"presentation": string,"recue_le": string,"traitee_le": string | null,"type_code": Database["public"]['Enums']["type_code"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "reception_participation_id_fkey"
      columns: ["participation_id"]
isOneToOne: true
      referencedRelation: "participation"
      referencedColumns: ["id"]
    }
                  ]
                },"mon_depot": {
                  Row: {
                    "contact_reutilisation": boolean,"demande": string | null,"depose_le": string,"fichiers_exclus": NonNullable<Json>,"licence_presente": boolean,"nb_fichiers": number,"nb_tokens": number,"outils_ia": NonNullable<Json>,"participation_id": string,"presentation": string,"sha256": string,"taille_octets": number,"type_code": Database["public"]['Enums']["type_code"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "depot_participation_id_fkey"
      columns: ["participation_id"]
isOneToOne: true
      referencedRelation: "participation"
      referencedColumns: ["id"]
    }
                  ]
                },"places_campagne": {
                  Row: {
                    "campagne_id": string,"places_restantes": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"rapport": {
                  Row: {
                    "campagne_id": string,"depot_id": string,"id": string,"jure": string,"resultat": Json | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "audit_depot_id_fkey"
      columns: ["depot_id"]
isOneToOne: false
      referencedRelation: "depot"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participation_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participation_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "classement"
      referencedColumns: ["campagne_id"]
    },{
      foreignKeyName: "participation_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "places_campagne"
      referencedColumns: ["campagne_id"]
    }
                  ]
                }
          }
          Functions: {
            "_inscrire":
{ Args: { "p_campagne_id": string,"p_compte_id": string,"p_hors_quota": boolean }; Returns: undefined
                           },
"ajouter_participant":
{ Args: { "p_campagne_id": string,"p_compte_id": string }; Returns: undefined
                           },
"changer_statut_campagne":
{ Args: { "p_campagne_id": string,"p_statut": Database["public"]['Enums']["campagne_statut"] }; Returns: undefined
                           },
"confirmer_attente":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"consommer_debit":
{ Args: { "p_action": string,"p_empreinte": string,"p_fenetre_s": number,"p_maximum": number }; Returns: number
                           },
"decider_compte":
{ Args: { "p_compte_id": string,"p_etat": Database["public"]['Enums']["compte_etat"] }; Returns: undefined
                           },
"demasquer_replique":
{ Args: { "p_audit_id": string }; Returns: undefined
                           },
"enregistrer_decision":
{ Args: { "p_justification": string,"p_participation_id": string,"p_type": Database["public"]['Enums']["decision_type"] }; Returns: undefined
                           },
"est_organisateur":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"masquer_replique":
{ Args: { "p_audit_id": string }; Returns: undefined
                           },
"noter_connexion":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"objets_abandonnes":
{ Args: { "p_age_h": number,"p_limite": number }; Returns: string[]
                           },
"purger_debit":
{ Args: { "p_age_h": number,"p_limite": number }; Returns: number
                           },
"regler_contact_reutilisation":
{ Args: { "p_accord": boolean,"p_campagne_id": string }; Returns: undefined
                           },
"retirer_depot":
{ Args: { "p_campagne_id": string }; Returns: undefined
                           },
"se_desinscrire":
{ Args: { "p_campagne_id": string }; Returns: undefined
                           },
"sinscrire":
{ Args: { "p_campagne_id": string }; Returns: undefined
                           },
"verrouiller_vote":
{ Args: { "p_participation_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "audit_statut": "en_cours"|"termine"|"echec","campagne_statut": "brouillon"|"inscriptions"|"depot"|"deliberation"|"prete"|"publiee"|"archivee","compte_etat": "email_a_verifier"|"verifie"|"autorise"|"liste_attente"|"refuse"|"ferme","compte_role": "candidat"|"organisateur","decision_type": "departage"|"disqualification"|"fermeture_compte","participation_etat": "inscrit"|"retire","reception_etat": "en_attente"|"acceptee"|"refusee","type_code": "open_source"|"proprietaire"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "audit_statut": ["en_cours", "termine", "echec"],"campagne_statut": ["brouillon", "inscriptions", "depot", "deliberation", "prete", "publiee", "archivee"],"compte_etat": ["email_a_verifier", "verifie", "autorise", "liste_attente", "refuse", "ferme"],"compte_role": ["candidat", "organisateur"],"decision_type": ["departage", "disqualification", "fermeture_compte"],"participation_etat": ["inscrit", "retire"],"reception_etat": ["en_attente", "acceptee", "refusee"],"type_code": ["open_source", "proprietaire"]
          }
        }
} as const
