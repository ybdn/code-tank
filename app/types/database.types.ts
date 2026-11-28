
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit": {
                  Row: {
                    "batch_id": string | null,"cout_usd": number | null,"cree_le": string,"depot_id": string,"id": string,"jure": string,"modele": string | null,"replique_masquee": boolean,"resultat": Json | null,"statut": string,"tentatives": number,"usage": Json | null,"version_consignes": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"cout_usd"?: number | null,"cree_le"?: string,"depot_id": string,"id"?: string,"jure": string,"modele"?: string | null,"replique_masquee"?: boolean,"resultat"?: Json | null,"statut"?: string,"tentatives"?: number,"usage"?: Json | null,"version_consignes"?: string | null
                  }
                  Update: {
                    "batch_id"?: string | null,"cout_usd"?: number | null,"cree_le"?: string,"depot_id"?: string,"id"?: string,"jure"?: string,"modele"?: string | null,"replique_masquee"?: boolean,"resultat"?: Json | null,"statut"?: string,"tentatives"?: number,"usage"?: Json | null,"version_consignes"?: string | null
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
                    "bloquee_le": string | null,"boss_id": string,"brief": string,"cle_fin": string | null,"cloture_depot": string,"cree_le": string,"date_resultats": string,"fin_prevenue_le": string | null,"id": string,"jeton_invitation": string | null,"lancements": number,"langages": (string)[],"max_participants": number,"motif_blocage": string | null,"ouverture_inscriptions": string,"plafond_usd": number | null,"regles_figees_le": string | null,"role_boss": string,"slug": string,"statut": string,"theme": string,"titre": string,"visibilite": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bloquee_le"?: string | null,"boss_id": string,"brief": string,"cle_fin"?: string | null,"cloture_depot": string,"cree_le"?: string,"date_resultats": string,"fin_prevenue_le"?: string | null,"id"?: string,"jeton_invitation"?: string | null,"lancements"?: number,"langages": (string)[],"max_participants": number,"motif_blocage"?: string | null,"ouverture_inscriptions": string,"plafond_usd"?: number | null,"regles_figees_le"?: string | null,"role_boss": string,"slug": string,"statut"?: string,"theme": string,"titre": string,"visibilite": string
                  }
                  Update: {
                    "bloquee_le"?: string | null,"boss_id"?: string,"brief"?: string,"cle_fin"?: string | null,"cloture_depot"?: string,"cree_le"?: string,"date_resultats"?: string,"fin_prevenue_le"?: string | null,"id"?: string,"jeton_invitation"?: string | null,"lancements"?: number,"langages"?: (string)[],"max_participants"?: number,"motif_blocage"?: string | null,"ouverture_inscriptions"?: string,"plafond_usd"?: number | null,"regles_figees_le"?: string | null,"role_boss"?: string,"slug"?: string,"statut"?: string,"theme"?: string,"titre"?: string,"visibilite"?: string
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
                },"depot": {
                  Row: {
                    "alerte_manipulation": boolean,"alertes_integrite": NonNullable<Json>,"chemin_filtre": string | null,"chemin_stockage": string,"demande": string | null,"depose_le": string,"droit_declare_le": string,"faits": Json | null,"fichiers_exclus": NonNullable<Json>,"id": string,"nb_fichiers": number,"nb_tokens_estime": number,"nb_tokens_exact": number | null,"note_outillage": number | null,"participation_id": string,"presentation": string,"sha256": string,"trop_gros": boolean,"effacer_archives": (string)[] | null
                  }
                  ComputedFields: "effacer_archives"
                  Insert: {
                    "alerte_manipulation"?: boolean,"alertes_integrite"?: NonNullable<Json>,"chemin_filtre"?: string | null,"chemin_stockage": string,"demande"?: string | null,"depose_le"?: string,"droit_declare_le": string,"faits"?: Json | null,"fichiers_exclus"?: NonNullable<Json>,"id"?: string,"nb_fichiers": number,"nb_tokens_estime": number,"nb_tokens_exact"?: number | null,"note_outillage"?: number | null,"participation_id": string,"presentation": string,"sha256": string,"trop_gros"?: boolean
                  }
                  Update: {
                    "alerte_manipulation"?: boolean,"alertes_integrite"?: NonNullable<Json>,"chemin_filtre"?: string | null,"chemin_stockage"?: string,"demande"?: string | null,"depose_le"?: string,"droit_declare_le"?: string,"faits"?: Json | null,"fichiers_exclus"?: NonNullable<Json>,"id"?: string,"nb_fichiers"?: number,"nb_tokens_estime"?: number,"nb_tokens_exact"?: number | null,"note_outillage"?: number | null,"participation_id"?: string,"presentation"?: string,"sha256"?: string,"trop_gros"?: boolean
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
                },"engagement": {
                  Row: {
                    "accepte_le": string,"campagne_id": string,"compte_id": string,"id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepte_le"?: string,"campagne_id": string,"compte_id": string,"id"?: string,"version": string
                  }
                  Update: {
                    "accepte_le"?: string,"campagne_id"?: string,"compte_id"?: string,"id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "engagement_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "engagement_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne_calculee"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "engagement_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne_phase"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "engagement_compte_id_fkey"
      columns: ["compte_id"]
isOneToOne: false
      referencedRelation: "compte"
      referencedColumns: ["id"]
    }
                  ]
                },"participation": {
                  Row: {
                    "campagne_id": string,"compte_id": string | null,"connaissance_envoi_le": string,"etat": string,"id": string,"inscrit_le": string,"retire_le": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "campagne_id": string,"compte_id"?: string | null,"connaissance_envoi_le": string,"etat"?: string,"id"?: string,"inscrit_le"?: string,"retire_le"?: string | null
                  }
                  Update: {
                    "campagne_id"?: string,"compte_id"?: string | null,"connaissance_envoi_le"?: string,"etat"?: string,"id"?: string,"inscrit_le"?: string,"retire_le"?: string | null
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
      referencedRelation: "campagne_calculee"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participation_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne_phase"
      referencedColumns: ["id"]
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
                    "chemin_stockage": string,"cree_le": string,"demande": string | null,"droit_declare_le": string,"id": string,"motifs": Json | null,"participation_id": string,"presentation": string,"statut": string,"tentatives": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chemin_stockage": string,"cree_le"?: string,"demande"?: string | null,"droit_declare_le": string,"id"?: string,"motifs"?: Json | null,"participation_id": string,"presentation": string,"statut"?: string,"tentatives"?: number
                  }
                  Update: {
                    "chemin_stockage"?: string,"cree_le"?: string,"demande"?: string | null,"droit_declare_le"?: string,"id"?: string,"motifs"?: Json | null,"participation_id"?: string,"presentation"?: string,"statut"?: string,"tentatives"?: number
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
                },"telechargement": {
                  Row: {
                    "campagne_id": string,"compte_id": string,"depot_id": string | null,"id": string,"telecharge_le": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campagne_id": string,"compte_id": string,"depot_id"?: string | null,"id"?: string,"telecharge_le"?: string
                  }
                  Update: {
                    "campagne_id"?: string,"compte_id"?: string,"depot_id"?: string | null,"id"?: string,"telecharge_le"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "telechargement_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "telechargement_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne_calculee"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "telechargement_campagne_id_fkey"
      columns: ["campagne_id"]
isOneToOne: false
      referencedRelation: "campagne_phase"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "telechargement_compte_id_fkey"
      columns: ["compte_id"]
isOneToOne: false
      referencedRelation: "compte"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "telechargement_depot_id_fkey"
      columns: ["depot_id"]
isOneToOne: false
      referencedRelation: "depot"
      referencedColumns: ["id"]
    }
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
            "campagne_calculee": {
                  Row: {
                    "boss_id": string,"boss_pseudo": string,"brief": string,"cloture_depot": string,"date_resultats": string,"id": string,"jeton_invitation": string | null,"langages": (string)[],"max_participants": number,"ouverture_inscriptions": string,"phase": string | null,"places_restantes": number | null,"role_boss": string,"slug": string,"statut": string,"theme": string,"titre": string,"visibilite": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "campagne_boss_id_fkey"
      columns: ["boss_id"]
isOneToOne: false
      referencedRelation: "compte"
      referencedColumns: ["id"]
    }
                  ]
                },"campagne_phase": {
                  Row: {
                    "boss_pseudo": string,"brief": string,"cloture_depot": string,"date_resultats": string,"id": string,"langages": (string)[],"max_participants": number,"ouverture_inscriptions": string,"phase": string | null,"places_restantes": number | null,"role_boss": string,"slug": string,"statut": string,"theme": string,"titre": string,"visibilite": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "abandonner_audits":
{ Args: { "p_campagne": string }; Returns: undefined
                           },
"accepter_depot":
{ Args: { "p_alerte_manipulation": boolean,"p_alertes_integrite": Json,"p_chemin_filtre": string,"p_faits": Json,"p_fichiers_exclus": Json,"p_nb_fichiers": number,"p_nb_tokens_estime": number,"p_note_outillage": number,"p_reception": string,"p_sha256": string }; Returns: (string)[]
                           },
"audits_termines":
{ Args: { "p_campagne": string }; Returns: boolean
                           },
"campagne_vivante":
{ Args: { "p_campagne": string }; Returns: boolean
                           },
"changer_pseudo":
{ Args: { "p_pseudo": string }; Returns: undefined
                           },
"cloturer_cles_expirees":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"cloturer_deliberation":
{ Args: { "p_campagne": string,"p_forcer"?: boolean }; Returns: string
                           },
"compte_actif":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"consommer_debit":
{ Args: { "p_action": string,"p_empreinte": string,"p_fenetre_s": number,"p_maximum": number }; Returns: number
                           },
"cout_tokens":
{ Args: { "p_ecriture_cache": number,"p_entree": number,"p_lecture_cache": number,"p_lot": boolean,"p_sortie": number }; Returns: number
                           },
"creer_campagne":
{ Args: { "p_brief": string,"p_cloture_depot": string,"p_date_resultats": string,"p_langages": (string)[],"p_max_participants": number,"p_ouverture_inscriptions": string,"p_role_boss": string,"p_theme": string,"p_titre": string,"p_visibilite": string }; Returns: string
                           },
"creer_compte":
{ Args: { "p_charte_acceptee": boolean,"p_compte": string,"p_majeur": boolean,"p_pseudo": string,"p_version_charte": string }; Returns: undefined
                           },
"depense_audits":
{ Args: { "p_campagne": string }; Returns: number
                           },
"deposer":
{ Args: { "p_campagne": string,"p_chemin": string,"p_demande": string,"p_droit_declare": boolean,"p_presentation": string }; Returns: undefined
                           },
"depots_du_boss":
{ Args: { "p_campagne": string }; Returns: {
              "alerte_manipulation": boolean,"alertes_integrite": Json,"archive_disponible": boolean,"depot_id": string,"participation_id": string,"pseudo": string
            }[]
                           },
"ecrire_tokens_exacts":
{ Args: { "p_depot": string,"p_nb": number }; Returns: boolean
                           },
"effacer_archives":
{ Args: { "d": Omit<Database["public"]['Tables']["depot"]['Row'], Database["public"]['Tables']["depot"]['ComputedFields']> }; Returns: (string)[]
                           },
"effacer_cle_boss":
{ Args: { "p_campagne": string }; Returns: undefined
                           },
"enregistrer_audit":
{ Args: { "p_audit": string,"p_resultat": Json,"p_statut": string,"p_usage": Json }; Returns: number
                           },
"est_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"est_boss":
{ Args: { "p_campagne": string }; Returns: boolean
                           },
"estimer_pire_cas":
{ Args: { "p_campagne": string }; Returns: number
                           },
"fins_a_prevenir":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"journaliser_telechargement":
{ Args: { "p_campagne": string,"p_depot": string }; Returns: string
                           },
"lancer_deliberation":
{ Args: { "p_campagne": string,"p_cle": string,"p_compte": string,"p_plafond_usd": number,"p_version_engagements": string }; Returns: Json
                           },
"lire_cle_boss":
{ Args: { "p_campagne": string }; Returns: string
                           },
"lire_invitation":
{ Args: { "p_jeton": string }; Returns: {
              "boss_pseudo": string,
"brief": string,
"cloture_depot": string,
"date_resultats": string,
"id": string,
"langages": (string)[],
"max_participants": number,
"ouverture_inscriptions": string,
"phase": string | null,
"places_restantes": number | null,
"role_boss": string,
"slug": string,
"statut": string,
"theme": string,
"titre": string,
"visibilite": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "campagne_phase"
        isOneToOne: false
        isSetofReturn: true
      } },
"marquer_envoye":
{ Args: { "p_audits": (string)[],"p_batch_id": string }; Returns: number
                           },
"modifier_campagne":
{ Args: { "p_brief": string,"p_campagne": string,"p_cloture_depot": string,"p_date_resultats": string,"p_langages": (string)[],"p_max_participants": number,"p_ouverture_inscriptions": string,"p_role_boss": string,"p_theme": string,"p_titre": string,"p_visibilite": string }; Returns: undefined
                           },
"noter_tentative_reception":
{ Args: { "p_reception": string }; Returns: number
                           },
"ouvrir_campagne":
{ Args: { "p_campagne": string }; Returns: undefined
                           },
"peut_deposer":
{ Args: { "p_campagne": string }; Returns: string
                           },
"prendre_verrou":
{ Args: { "p_detenteur": string,"p_nom": string,"p_secondes": number }; Returns: boolean
                           },
"progression_deliberation":
{ Args: { "p_campagne": string }; Returns: Json
                           },
"refuser_reception":
{ Args: { "p_motifs": Json,"p_reception": string }; Returns: string
                           },
"regenerer_invitation":
{ Args: { "p_campagne": string }; Returns: string
                           },
"regler_mode_acces":
{ Args: { "p_mode": string }; Returns: undefined
                           },
"rendre_verrou":
{ Args: { "p_detenteur": string,"p_nom": string }; Returns: boolean
                           },
"reserver_envoi":
{ Args: { "p_campagne": string }; Returns: Json
                           },
"retirer_depot":
{ Args: { "p_campagne": string }; Returns: (string)[]
                           },
"se_desinscrire":
{ Args: { "p_campagne": string }; Returns: undefined
                           },
"sinscrire":
{ Args: { "p_campagne": string,"p_connaissance": boolean,"p_jeton"?: string }; Returns: undefined
                           },
"supprimer_brouillon":
{ Args: { "p_campagne": string }; Returns: undefined
                           },
"terminer_deliberation":
{ Args: { "p_campagne": string,"p_compte": string }; Returns: string
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
