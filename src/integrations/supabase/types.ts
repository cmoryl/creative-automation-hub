export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_pairings: {
        Row: {
          created_at: string
          id: string
          last_seen: string | null
          name: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen?: string | null
          name: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen?: string | null
          name?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_pairings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_status: {
        Row: {
          agent_id: string
          agent_version: string | null
          apps: Json
          current_job_id: string | null
          disk_free_mb: number | null
          fonts_count: number
          fonts_sample: Json
          host: string | null
          platform: string | null
          reported_at: string
          templates_seen: number
          workspace_id: string
        }
        Insert: {
          agent_id: string
          agent_version?: string | null
          apps?: Json
          current_job_id?: string | null
          disk_free_mb?: number | null
          fonts_count?: number
          fonts_sample?: Json
          host?: string | null
          platform?: string | null
          reported_at?: string
          templates_seen?: number
          workspace_id: string
        }
        Update: {
          agent_id?: string
          agent_version?: string | null
          apps?: Json
          current_job_id?: string | null
          disk_free_mb?: number | null
          fonts_count?: number
          fonts_sample?: Json
          host?: string | null
          platform?: string | null
          reported_at?: string
          templates_seen?: number
          workspace_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          project_id: string | null
          summary: string | null
          target_id: string | null
          target_type: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          summary?: string | null
          target_id?: string | null
          target_type: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          summary?: string | null
          target_id?: string | null
          target_type?: string
          workspace_id?: string
        }
        Relationships: []
      }
      batch_approvals: {
        Row: {
          batch_key: string
          created_at: string
          decided_at: string | null
          id: string
          metadata: Json
          project_id: string
          reviewer_id: string | null
          reviewer_notes: string | null
          status: Database["public"]["Enums"]["approval_status"]
          submitted_by: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          batch_key: string
          created_at?: string
          decided_at?: string | null
          id?: string
          metadata?: Json
          project_id: string
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_by: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          batch_key?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          metadata?: Json
          project_id?: string
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_by?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          parts: Json
          project_id: string
          role: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          parts?: Json
          project_id: string
          role: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          parts?: Json
          project_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          accent_color: string | null
          brand_metadata: Json
          contact_email: string | null
          contact_url: string | null
          created_at: string
          created_by: string
          description: string | null
          font_family: string | null
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accent_color?: string | null
          brand_metadata?: Json
          contact_email?: string | null
          contact_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accent_color?: string | null
          brand_metadata?: Json
          contact_email?: string | null
          contact_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          approval_id: string | null
          assigned_agent_id: string | null
          brief: Json
          claimed_at: string | null
          claude_thread_id: string | null
          completed_at: string | null
          created_at: string
          engine: string
          error: string | null
          error_detail: Json | null
          error_stage: string | null
          id: string
          max_retries: number
          next_retry_at: string | null
          project_id: string
          retry_count: number
          row_label: string | null
          status: string
          submitted_for_approval_at: string | null
          template_id: string | null
          transient: boolean | null
          updated_at: string
          variables: Json
          workspace_id: string | null
        }
        Insert: {
          approval_id?: string | null
          assigned_agent_id?: string | null
          brief?: Json
          claimed_at?: string | null
          claude_thread_id?: string | null
          completed_at?: string | null
          created_at?: string
          engine?: string
          error?: string | null
          error_detail?: Json | null
          error_stage?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          project_id: string
          retry_count?: number
          row_label?: string | null
          status?: string
          submitted_for_approval_at?: string | null
          template_id?: string | null
          transient?: boolean | null
          updated_at?: string
          variables?: Json
          workspace_id?: string | null
        }
        Update: {
          approval_id?: string | null
          assigned_agent_id?: string | null
          brief?: Json
          claimed_at?: string | null
          claude_thread_id?: string | null
          completed_at?: string | null
          created_at?: string
          engine?: string
          error?: string | null
          error_detail?: Json | null
          error_stage?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          project_id?: string
          retry_count?: number
          row_label?: string | null
          status?: string
          submitted_for_approval_at?: string | null
          template_id?: string | null
          transient?: boolean | null
          updated_at?: string
          variables?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      outputs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          kind: string
          metadata: Json
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          kind: string
          metadata?: Json
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          kind?: string
          metadata?: Json
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "outputs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assets: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          kind: string
          metadata: Json
          name: string
          product_id: string | null
          prompt: string | null
          source: string
          url: string
          workspace_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          metadata?: Json
          name: string
          product_id?: string | null
          prompt?: string | null
          source?: string
          url: string
          workspace_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          metadata?: Json
          name?: string
          product_id?: string | null
          prompt?: string | null
          source?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          accent_color: string | null
          brand_metadata: Json
          company_id: string
          contact_email: string | null
          contact_url: string | null
          created_at: string
          created_by: string
          description: string | null
          font_family: string | null
          id: string
          logo_url: string | null
          name: string
          parent_product_id: string | null
          primary_color: string | null
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accent_color?: string | null
          brand_metadata?: Json
          company_id: string
          contact_email?: string | null
          contact_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          name: string
          parent_product_id?: string | null
          primary_color?: string | null
          slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accent_color?: string | null
          brand_metadata?: Json
          company_id?: string
          contact_email?: string | null
          contact_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          parent_product_id?: string | null
          primary_color?: string | null
          slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          brief: string | null
          company_id: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          product_id: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brief?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          product_id?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brief?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          product_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_agent_availability: {
        Row: {
          agent_id: string
          checked_at: string
          file_present: boolean
          fonts_missing: Json
          links_missing: Json
          template_id: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          checked_at?: string
          file_present?: boolean
          fonts_missing?: Json
          links_missing?: Json
          template_id: string
          workspace_id: string
        }
        Update: {
          agent_id?: string
          checked_at?: string
          file_present?: boolean
          fonts_missing?: Json
          links_missing?: Json
          template_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          company_id: string | null
          created_at: string
          engine: string
          id: string
          name: string
          pages: Json
          preview_url: string | null
          product_id: string | null
          requirements: Json
          source_ref: string | null
          variables: Json
          workspace_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          engine: string
          id?: string
          name: string
          pages?: Json
          preview_url?: string | null
          product_id?: string | null
          requirements?: Json
          source_ref?: string | null
          variables?: Json
          workspace_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          engine?: string
          id?: string
          name?: string
          pages?: Json
          preview_url?: string | null
          product_id?: string | null
          requirements?: Json
          source_ref?: string | null
          variables?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_api_tokens: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_used_at: string | null
          name: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_used_at?: string | null
          name: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_used_at?: string | null
          name?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_api_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_integrations: {
        Row: {
          access_token: string
          created_at: string
          id: string
          metadata: Json
          provider: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          metadata?: Json
          provider: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          metadata?: Json
          provider?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      seed_workspace_examples: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "member"
      approval_status: "pending" | "approved" | "changes_requested" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
      approval_status: ["pending", "approved", "changes_requested", "rejected"],
    },
  },
} as const
