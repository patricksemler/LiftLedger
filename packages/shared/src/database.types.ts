export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_calls: {
        Row: {
          created_at: string
          error: string | null
          id: number
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          purpose: string
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          purpose: string
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          purpose?: string
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          date: string
          fat_percent: number | null
          source: string
          synced_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          date: string
          fat_percent?: number | null
          source: string
          synced_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          date?: string
          fat_percent?: number | null
          source?: string
          synced_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      bot_messages: {
        Row: {
          content: string
          created_at: string
          id: number
          meal_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          meal_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
          meal_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_messages_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_templates: {
        Row: {
          equipment: string | null
          id: string
          is_custom: boolean
          primary_muscle_group: string | null
          secondary_muscle_groups: string[]
          synced_at: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          equipment?: string | null
          id: string
          is_custom?: boolean
          primary_muscle_group?: string | null
          secondary_muscle_groups?: string[]
          synced_at?: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          equipment?: string | null
          id?: string
          is_custom?: boolean
          primary_muscle_group?: string | null
          secondary_muscle_groups?: string[]
          synced_at?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      health_daily: {
        Row: {
          date: string
          metric: string
          synced_at: string
          user_id: string
          value: number
        }
        Insert: {
          date: string
          metric: string
          synced_at?: string
          user_id: string
          value: number
        }
        Update: {
          date?: string
          metric?: string
          synced_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      health_ingest_tokens: {
        Row: {
          created_at: string
          last_used_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_used_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_used_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      hevy_sync_state: {
        Row: {
          backfill_done: boolean
          backfill_page: number
          body_backfill_done: boolean
          last_error: string | null
          last_event_sync: string | null
          last_run_at: string | null
          templates_synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          backfill_done?: boolean
          backfill_page?: number
          body_backfill_done?: boolean
          last_error?: string | null
          last_event_sync?: string | null
          last_run_at?: string | null
          templates_synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          backfill_done?: boolean
          backfill_page?: number
          body_backfill_done?: boolean
          last_error?: string | null
          last_event_sync?: string | null
          last_run_at?: string | null
          templates_synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          last_error: string | null
          last_sync_at: string | null
          provider: string
          secret_last4: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider: string
          secret_last4?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          secret_last4?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_items: {
        Row: {
          brand: string | null
          calories: number
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          grams: number | null
          id: string
          match_ref: string | null
          match_source: string
          meal_id: string
          name: string
          position: number
          protein_g: number
          quantity: number | null
          unit: string | null
          user_id: string
        }
        Insert: {
          brand?: string | null
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          grams?: number | null
          id?: string
          match_ref?: string | null
          match_source?: string
          meal_id: string
          name: string
          position?: number
          protein_g?: number
          quantity?: number | null
          unit?: string | null
          user_id?: string
        }
        Update: {
          brand?: string | null
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          grams?: number | null
          id?: string
          match_ref?: string | null
          match_source?: string
          meal_id?: string
          name?: string
          position?: number
          protein_g?: number
          quantity?: number | null
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          calories: number
          carbs_g: number
          confidence: string | null
          created_at: string
          eaten_at: string
          fat_g: number
          fiber_g: number
          id: string
          local_date: string
          parse: Json | null
          protein_g: number
          raw_text: string | null
          source: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number
          carbs_g?: number
          confidence?: string | null
          created_at?: string
          eaten_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          local_date: string
          parse?: Json | null
          protein_g?: number
          raw_text?: string | null
          source?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          confidence?: string | null
          created_at?: string
          eaten_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          local_date?: string
          parse?: Json | null
          protein_g?: number
          raw_text?: string | null
          source?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_goals: {
        Row: {
          calories: number
          carbs_g: number
          created_at: string
          effective_from: string
          fat_g: number
          id: string
          preset: string
          protein_g: number
          protein_g_per_lb: number | null
          rationale: string | null
          user_id: string
        }
        Insert: {
          calories: number
          carbs_g: number
          created_at?: string
          effective_from: string
          fat_g: number
          id?: string
          preset: string
          protein_g: number
          protein_g_per_lb?: number | null
          rationale?: string | null
          user_id?: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          created_at?: string
          effective_from?: string
          fat_g?: number
          id?: string
          preset?: string
          protein_g?: number
          protein_g_per_lb?: number | null
          rationale?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string | null
          birth_date: string | null
          created_at: string
          display_name: string | null
          height_cm: number | null
          onboarded_at: string | null
          sex: string | null
          timezone: string
          units: string
          updated_at: string
          user_id: string
          weight_source: string
        }
        Insert: {
          activity_level?: string | null
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          height_cm?: number | null
          onboarded_at?: string | null
          sex?: string | null
          timezone?: string
          units?: string
          updated_at?: string
          user_id: string
          weight_source?: string
        }
        Update: {
          activity_level?: string | null
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          height_cm?: number | null
          onboarded_at?: string | null
          sex?: string | null
          timezone?: string
          units?: string
          updated_at?: string
          user_id?: string
          weight_source?: string
        }
        Relationships: []
      }
      saved_foods: {
        Row: {
          brand: string | null
          calories: number
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          id: string
          name: string
          protein_g: number
          serving_desc: string
          serving_grams: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          calories: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          name: string
          protein_g?: number
          serving_desc?: string
          serving_grams?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          brand?: string | null
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          name?: string
          protein_g?: number
          serving_desc?: string
          serving_grams?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_link_codes: {
        Row: {
          code_hash: string
          expires_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          expires_at: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          expires_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_links: {
        Row: {
          chat_id: number
          linked_at: string
          tg_user_id: number
          tg_username: string | null
          user_id: string
        }
        Insert: {
          chat_id: number
          linked_at?: string
          tg_user_id: number
          tg_username?: string | null
          user_id: string
        }
        Update: {
          chat_id?: number
          linked_at?: string
          tg_user_id?: number
          tg_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_secrets: {
        Row: {
          auth_tag: string
          ciphertext: string
          iv: string
          key_version: number
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_tag: string
          ciphertext: string
          iv: string
          key_version?: number
          kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_tag?: string
          ciphertext?: string
          iv?: string
          key_version?: number
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_sets: {
        Row: {
          distance_meters: number | null
          duration_seconds: number | null
          exercise_index: number
          exercise_template_id: string | null
          exercise_title: string
          id: number
          reps: number | null
          rpe: number | null
          set_index: number
          set_type: string | null
          user_id: string
          weight_kg: number | null
          workout_id: string
        }
        Insert: {
          distance_meters?: number | null
          duration_seconds?: number | null
          exercise_index: number
          exercise_template_id?: string | null
          exercise_title: string
          id?: never
          reps?: number | null
          rpe?: number | null
          set_index: number
          set_type?: string | null
          user_id: string
          weight_kg?: number | null
          workout_id: string
        }
        Update: {
          distance_meters?: number | null
          duration_seconds?: number | null
          exercise_index?: number
          exercise_template_id?: string | null
          exercise_title?: string
          id?: never
          reps?: number | null
          rpe?: number | null
          set_index?: number
          set_type?: string | null
          user_id?: string
          weight_kg?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_user_id_workout_id_fkey"
            columns: ["user_id", "workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      workouts: {
        Row: {
          description: string | null
          end_time: string | null
          hevy_updated_at: string | null
          id: string
          raw: Json
          start_time: string
          synced_at: string
          title: string | null
          user_id: string
        }
        Insert: {
          description?: string | null
          end_time?: string | null
          hevy_updated_at?: string | null
          id: string
          raw: Json
          start_time: string
          synced_at?: string
          title?: string | null
          user_id: string
        }
        Update: {
          description?: string | null
          end_time?: string | null
          hevy_updated_at?: string | null
          id?: string
          raw?: Json
          start_time?: string
          synced_at?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      bodyweight: {
        Row: {
          date: string | null
          fat_percent: number | null
          source: string | null
          user_id: string | null
          weight_kg: number | null
        }
        Relationships: []
      }
      daily_nutrition: {
        Row: {
          calories: number | null
          carbs_g: number | null
          date: string | null
          fat_g: number | null
          fiber_g: number | null
          goal_calories: number | null
          goal_protein_g: number | null
          meal_count: number | null
          protein_g: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      log_meal: {
        Args: {
          p_confidence?: string
          p_eaten_at?: string
          p_items: Json
          p_parse?: Json
          p_raw_text?: string
          p_source?: string
          p_title: string
          p_user_id?: string
        }
        Returns: string
      }
      match_recent_items: {
        Args: { p_limit?: number; p_query: string; p_user_id: string }
        Returns: {
          brand: string
          calories: number
          carbs_g: number
          fat_g: number
          fiber_g: number
          grams: number
          match_source: string
          name: string
          protein_g: number
          quantity: number
          score: number
          times: number
          unit: string
        }[]
      }
      match_saved_foods: {
        Args: { p_limit?: number; p_query: string; p_user_id: string }
        Returns: {
          brand: string
          calories: number
          carbs_g: number
          fat_g: number
          fiber_g: number
          id: string
          name: string
          protein_g: number
          score: number
          serving_desc: string
          serving_grams: number
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

