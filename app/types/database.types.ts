
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "campagne": {
                  Row: {
                    "bloquee_le": string | null,"boss_id": string,"brief": string,"cloture_depot": string,"cree_le": string,"date_resultats": string,"id": string,"langages": (string)[],"max_participants": number,"motif_blocage": string | null,"ouverture_inscriptions": string,"regles_figees_le": string | null,"role_boss": string,"slug": string,"statut": string,"theme": string,"titre": string,"visibilite": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bloquee_le"?: string | null,"boss_id": string,"brief": string,"cloture_depot": string,"cree_le"?: string,"date_resultats": string,"id"?: string,"langages": (string)[],"max_participants": number,"motif_blocage"?: string | null,"ouverture_inscriptions": string,"regles_figees_le"?: string | null,"role_boss": string,"slug": string,"statut"?: string,"theme": string,"titre": string,"visibilite": string
                  }
                  Update: {
                    "bloquee_le"?: string | null,"boss_id"?: string,"brief"?: string,"cloture_depot"?: string,"cree_le"?: string,"date_resultats"?: string,"id"?: string,"langages"?: (string)[],"max_participants"?: number,"motif_blocage"?: string | null,"ouverture_inscriptions"?: string,"regles_figees_le"?: string | null,"role_boss"?: string,"slug"?: string,"statut"?: string,"theme"?: string,"titre"?: string,"visibilite"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campagne_boss_id_fkey"
      columns: ["boss_id"]
isOneToOne: false
      referencedRelation: "compte"
      referencedColumns: ["id"]
    }
                  ]
                },"compte": {
                  Row: {
                    "charte_acceptee_le": string,"cree_le": string,"etat": string,"etat_le": string,"github_id": string,"id": string,"majeur_declare_le": string,"pseudo": string,"role": string,"version_charte": string
                  }
                  ComputedFields: never
                  Insert: {
                    "charte_acceptee_le": string,"cree_le"?: string,"etat": string,"etat_le"?: string,"github_id": string,"id": string,"majeur_declare_le": string,"pseudo": string,"role"?: string,"version_charte": string
                  }
                  Update: {
                    "charte_acceptee_le"?: string,"cree_le"?: string,"etat"?: string,"etat_le"?: string,"github_id"?: string,"id"?: string,"majeur_declare_le"?: string,"pseudo"?: string,"role"?: string,"version_charte"?: string
                  }
                  Relationships: [
                    
                  ]
                },"critere": {
                  Row: {
                    "calcule": boolean,"cle": string,"jure": string,"libelle": string,"poids": number
                  }
                  ComputedFields: never
                  Insert: {
                    "calcule"?: boolean,"cle": string,"jure": string,"libelle": string,"poids": number
                  }
                  Update: {
                    "calcule"?: boolean,"cle"?: string,"jure"?: string,"libelle"?: string,"poids"?: number
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
                },"reglage": {
                  Row: {
                    "id": boolean,"mode_acces": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"mode_acces"?: string
                  }
                  Update: {
                    "id"?: boolean,"mode_acces"?: string
                  }
                  Relationships: [
                    
                  ]
                },"verrou": {
                  Row: {
                    "detenteur": string,"expire_le": string,"nom": string
                  }
                  ComputedFields: never
                  Insert: {
                    "detenteur": string,"expire_le": string,"nom": string
                  }
                  Update: {
                    "detenteur"?: string,"expire_le"?: string,"nom"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "campagne_phase": {
                  Row: {
                    "boss_pseudo": string,"brief": string,"cloture_depot": string,"date_resultats": string,"id": string,"langages": (string)[],"max_participants": number,"ouverture_inscriptions": string,"phase": string | null,"role_boss": string,"slug": string,"statut": string,"theme": string,"titre": string,"visibilite": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "campagne_vivante":
{ Args: { "p_campagne": string }; Returns: boolean
                           },
"changer_pseudo":
{ Args: { "p_pseudo": string }; Returns: undefined
                           },
"compte_actif":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"consommer_debit":
{ Args: { "p_action": string,"p_empreinte": string,"p_fenetre_s": number,"p_maximum": number }; Returns: number
                           },
"creer_campagne":
{ Args: { "p_brief": string,"p_cloture_depot": string,"p_date_resultats": string,"p_langages": (string)[],"p_max_participants": number,"p_ouverture_inscriptions": string,"p_role_boss": string,"p_theme": string,"p_titre": string,"p_visibilite": string }; Returns: string
                           },
"creer_compte":
{ Args: { "p_charte_acceptee": boolean,"p_compte": string,"p_majeur": boolean,"p_pseudo": string,"p_version_charte": string }; Returns: undefined
                           },
"est_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"est_boss":
{ Args: { "p_campagne": string }; Returns: boolean
                           },
"modifier_campagne":
{ Args: { "p_brief": string,"p_campagne": string,"p_cloture_depot": string,"p_date_resultats": string,"p_langages": (string)[],"p_max_participants": number,"p_ouverture_inscriptions": string,"p_role_boss": string,"p_theme": string,"p_titre": string,"p_visibilite": string }; Returns: undefined
                           },
"ouvrir_campagne":
{ Args: { "p_campagne": string }; Returns: undefined
                           },
"prendre_verrou":
{ Args: { "p_detenteur": string,"p_nom": string,"p_secondes": number }; Returns: boolean
                           },
"regler_mode_acces":
{ Args: { "p_mode": string }; Returns: undefined
                           },
"rendre_verrou":
{ Args: { "p_detenteur": string,"p_nom": string }; Returns: boolean
                           },
"supprimer_brouillon":
{ Args: { "p_campagne": string }; Returns: undefined
                           },
"verifier_reglages":
{ Args: { "p_brief": string,"p_cloture": string,"p_langages": (string)[],"p_max_participants": number,"p_ouverture": string,"p_resultats": string,"p_role_boss": string,"p_theme": string,"p_titre": string,"p_visibilite": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
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
            
          }
        }
} as const
