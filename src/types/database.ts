/**
 * 由 `npm run types:db`（supabase gen types typescript --linked）生成。
 *
 * 生成来源的注意点：本仓库做过一次入口切换（见 .env.bak-before-cutover），而 supabase link
 * 指向的仍是切换前的旧项目。也就是说这个文件里的形状经核对是线上 schema 的【子集】——
 * scripts/check-schema-drift.mjs 会逐表逐列对着线上 PostgREST 核一遍（当前 58 张表全部通过）。
 * 线上比这里多出来的列不会出现在文件中，用到它们的地方要在这里补齐（下面带 [patch] 标记），
 * 或者想办法拿到线上库的直连串重新生成。
 */
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
      ai_model_prices: {
        Row: {
          currency: string
          input_per_1m: number
          model: string
          output_per_1m: number
          updated_at: string
        }
        Insert: {
          currency?: string
          input_per_1m?: number
          model: string
          output_per_1m?: number
          updated_at?: string
        }
        Update: {
          currency?: string
          input_per_1m?: number
          model?: string
          output_per_1m?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          completion_tokens: number | null
          conversation_id: string | null
          created_at: string
          id: number
          latency_ms: number | null
          model: string
          ok: boolean
          prompt_tokens: number | null
          source: string | null
          status_code: number | null
          user_id: string
        }
        Insert: {
          completion_tokens?: number | null
          conversation_id?: string | null
          created_at?: string
          id?: number
          latency_ms?: number | null
          model?: string
          ok?: boolean
          prompt_tokens?: number | null
          source?: string | null
          status_code?: number | null
          user_id: string
        }
        Update: {
          completion_tokens?: number | null
          conversation_id?: string | null
          created_at?: string
          id?: number
          latency_ms?: number | null
          model?: string
          ok?: boolean
          prompt_tokens?: number | null
          source?: string | null
          status_code?: number | null
          user_id?: string
        }
        Relationships: []
      }
      auth_attempts: {
        Row: {
          created_at: string
          id: number
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          type: string
          user_id: string
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at: string
          id?: string
          type: string
          user_id: string
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_log: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          region: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          region?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          region?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          question_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          emotion: string | null
          followups: string[] | null
          id: number
          meta: Json | null
          role: string
          sources: Json | null
          sub: string | null
          tags: string[] | null
          usage: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          emotion?: string | null
          followups?: string[] | null
          id?: number
          meta?: Json | null
          role: string
          sources?: Json | null
          sub?: string | null
          tags?: string[] | null
          usage?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          emotion?: string | null
          followups?: string[] | null
          id?: number
          meta?: Json | null
          role?: string
          sources?: Json | null
          sub?: string | null
          tags?: string[] | null
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_schedules: {
        Row: {
          created_at: string
          days_of_week: number[]
          email_enabled: boolean
          // [patch] 线上有、生成来源的旧项目没有。见文件头说明与 migration Section 96.1：
          // 这一列是「自选邮件发送日期」，4 处调用方在用，补上它才能按真实形状读写。
          email_send_date: string | null
          email_time: number | null
          enabled: boolean
          fire_time: number
          id: string
          last_email_date: string | null
          last_fire_date: string | null
          last_notify_date: string | null
          name: string
          template: Json
          tz: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          email_enabled?: boolean
          email_send_date?: string | null
          email_time?: number | null
          enabled?: boolean
          fire_time?: number
          id?: string
          last_email_date?: string | null
          last_fire_date?: string | null
          last_notify_date?: string | null
          name: string
          template: Json
          tz?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          email_enabled?: boolean
          email_send_date?: string | null
          email_time?: number | null
          enabled?: boolean
          fire_time?: number
          id?: string
          last_email_date?: string | null
          last_fire_date?: string | null
          last_notify_date?: string | null
          name?: string
          template?: Json
          tz?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          completed_at: string | null
          correct_count: number
          current_index: number
          duration_ms: number
          id: string
          question_ids: Json
          score: number | null
          started_at: string
          status: string
          template: Json | null
          total_questions: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          correct_count?: number
          current_index?: number
          duration_ms?: number
          id?: string
          question_ids: Json
          score?: number | null
          started_at?: string
          status?: string
          template?: Json | null
          total_questions?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          correct_count?: number
          current_index?: number
          duration_ms?: number
          id?: string
          question_ids?: Json
          score?: number | null
          started_at?: string
          status?: string
          template?: Json | null
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_templates: {
        Row: {
          cover: Json | null
          created_at: string
          duration_min: number
          id: string
          layout: Json | null
          name: string
          order_mode: string
          parent_id: string | null
          sample_mode: string
          sections: Json
          sort_order: number
          subject: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cover?: Json | null
          created_at?: string
          duration_min?: number
          id?: string
          layout?: Json | null
          name: string
          order_mode?: string
          parent_id?: string | null
          sample_mode?: string
          sections?: Json
          sort_order?: number
          subject?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cover?: Json | null
          created_at?: string
          duration_min?: number
          id?: string
          layout?: Json | null
          name?: string
          order_mode?: string
          parent_id?: string | null
          sample_mode?: string
          sections?: Json
          sort_order?: number
          subject?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_sessions: {
        Row: {
          created_at: string
          duration_sec: number
          ended_at: string | null
          id: string
          mode: string
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_sec?: number
          ended_at?: string | null
          id?: string
          mode?: string
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_sec?: number
          ended_at?: string | null
          id?: string
          mode?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kp_explanations: {
        Row: {
          content: string
          kp: string
          subject: string
          updated_at: string
        }
        Insert: {
          content: string
          kp: string
          subject: string
          updated_at?: string
        }
        Update: {
          content?: string
          kp?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      kp_question_map: {
        Row: {
          kp: string
          question_id: string
          seq_number: number | null
          subject: string | null
        }
        Insert: {
          kp: string
          question_id: string
          seq_number?: number | null
          subject?: string | null
        }
        Update: {
          kp?: string
          question_id?: string
          seq_number?: number | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kp_question_map_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      kp_question_refs: {
        Row: {
          created_at: string
          id: string
          kp: string
          note: string
          question_id: string
          sort_order: number
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kp: string
          note?: string
          question_id: string
          sort_order?: number
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kp?: string
          note?: string
          question_id?: string
          sort_order?: number
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kp_question_refs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kp_question_refs_subject_kp_fkey"
            columns: ["subject", "kp"]
            isOneToOne: false
            referencedRelation: "kp_explanations"
            referencedColumns: ["subject", "kp"]
          },
        ]
      }
      kp_resource_refs: {
        Row: {
          block_index: number | null
          blocks: number[]
          created_at: string
          doc_title: string
          document_id: string | null
          id: string
          kp: string
          label: string
          note: string
          page_from: number
          page_to: number
          snippet: string
          sort_order: number
          subject: string
          updated_at: string
        }
        Insert: {
          block_index?: number | null
          blocks?: number[]
          created_at?: string
          doc_title?: string
          document_id?: string | null
          id?: string
          kp: string
          label?: string
          note?: string
          page_from?: number
          page_to?: number
          snippet?: string
          sort_order?: number
          subject: string
          updated_at?: string
        }
        Update: {
          block_index?: number | null
          blocks?: number[]
          created_at?: string
          doc_title?: string
          document_id?: string | null
          id?: string
          kp?: string
          label?: string
          note?: string
          page_from?: number
          page_to?: number
          snippet?: string
          sort_order?: number
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kp_resource_refs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "resource_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kp_resource_refs_subject_kp_fkey"
            columns: ["subject", "kp"]
            isOneToOne: false
            referencedRelation: "kp_explanations"
            referencedColumns: ["subject", "kp"]
          },
        ]
      }
      learning_route_questions: {
        Row: {
          created_at: string
          id: string
          node_style: Json
          position: number
          question_id: string
          stage_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          node_style?: Json
          position?: number
          question_id: string
          stage_id: string
        }
        Update: {
          created_at?: string
          id?: string
          node_style?: Json
          position?: number
          question_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_route_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_route_questions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "learning_route_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_route_stages: {
        Row: {
          created_at: string
          description: string
          id: string
          node_style: Json
          position: number
          route_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          node_style?: Json
          position?: number
          route_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          node_style?: Json
          position?: number
          route_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_route_stages_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "learning_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_routes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          diagram_xml: string | null
          id: string
          is_published: boolean
          route_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          diagram_xml?: string | null
          id?: string
          is_published?: boolean
          route_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          diagram_xml?: string | null
          id?: string
          is_published?: boolean
          route_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parse_history: {
        Row: {
          category: string | null
          created_at: string
          display_name: string | null
          extra_formats: string | null
          file_name: string
          id: number
          json_data: string | null
          key_points: string | null
          markdown: string
          mode: string
          page_ranges: string | null
          pdf_page_urls: string | null
          pdf_total_pages: number | null
          questions_json: string | null
          status_json: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          display_name?: string | null
          extra_formats?: string | null
          file_name: string
          id?: number
          json_data?: string | null
          key_points?: string | null
          markdown: string
          mode?: string
          page_ranges?: string | null
          pdf_page_urls?: string | null
          pdf_total_pages?: number | null
          questions_json?: string | null
          status_json?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          display_name?: string | null
          extra_formats?: string | null
          file_name?: string
          id?: number
          json_data?: string | null
          key_points?: string | null
          markdown?: string
          mode?: string
          page_ranges?: string | null
          pdf_page_urls?: string | null
          pdf_total_pages?: number | null
          questions_json?: string | null
          status_json?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      passkey_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_backed_up: boolean | null
          credential_device_type: string | null
          credential_id: string
          device_name: string | null
          id: string
          last_used_at: string | null
          platform: string | null
          public_key: string
          transports: Json | null
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_backed_up?: boolean | null
          credential_device_type?: string | null
          credential_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          platform?: string | null
          public_key: string
          transports?: Json | null
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_backed_up?: boolean | null
          credential_device_type?: string | null
          credential_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          platform?: string | null
          public_key?: string
          transports?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passkey_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_daily_assignments: {
        Row: {
          assign_date: string
          carry_count: number
          completed_at: string | null
          created_at: string
          goal_count: number
          id: string
          kp_plan: Json
          qids: string[]
          review_count: number
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assign_date: string
          carry_count?: number
          completed_at?: string | null
          created_at?: string
          goal_count?: number
          id?: string
          kp_plan?: Json
          qids?: string[]
          review_count?: number
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assign_date?: string
          carry_count?: number
          completed_at?: string | null
          created_at?: string
          goal_count?: number
          id?: string
          kp_plan?: Json
          qids?: string[]
          review_count?: number
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_daily_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_sequential_state: {
        Row: {
          created_at: string
          current_index: number
          plan_subjects: string[]
          question_ids: string[]
          selected_kps: string[]
          session_key: string
          short_id: string | null
          subject_positions: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_index?: number
          plan_subjects?: string[]
          question_ids?: string[]
          selected_kps?: string[]
          session_key?: string
          short_id?: string | null
          subject_positions?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_index?: number
          plan_subjects?: string[]
          question_ids?: string[]
          selected_kps?: string[]
          session_key?: string
          short_id?: string | null
          subject_positions?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_sequential_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_preset: string | null
          avatar_url: string | null
          created_at: string
          daily_deadline: string | null
          daily_reset_at: string | null
          daily_targets: string | null
          deadline: string | null
          exam_status: string | null
          goal_type: string | null
          id: string
          kp_order_pos: string | null
          last_question_id: string | null
          mfa_grace_until: string | null
          mfa_validity_days: number
          milestones: Json | null
          nickname: string | null
          onboarded_at: string | null
          passkey_timeout_minutes: number
          plan_categories: string | null
          plan_goals: Json | null
          plan_key_points: string | null
          plan_reset_at: string | null
          plan_rounds: Json | null
          plan_scope: Json | null
          plan_subjects: string | null
          plan_targets: string | null
          plan_wrong_only: boolean
          preferred_2fa: string
          profile_visibility: Json
          role: string
          show_custom_overall: boolean | null
          show_long_overall: boolean | null
          show_overall: boolean | null
          show_overall_date: string | null
          skip_question_ids: string | null
          subject_reset_at: Json | null
          target_school: string | null
          totp_enabled: boolean
        }
        Insert: {
          avatar_preset?: string | null
          avatar_url?: string | null
          created_at?: string
          daily_deadline?: string | null
          daily_reset_at?: string | null
          daily_targets?: string | null
          deadline?: string | null
          exam_status?: string | null
          goal_type?: string | null
          id: string
          kp_order_pos?: string | null
          last_question_id?: string | null
          mfa_grace_until?: string | null
          mfa_validity_days?: number
          milestones?: Json | null
          nickname?: string | null
          onboarded_at?: string | null
          passkey_timeout_minutes?: number
          plan_categories?: string | null
          plan_goals?: Json | null
          plan_key_points?: string | null
          plan_reset_at?: string | null
          plan_rounds?: Json | null
          plan_scope?: Json | null
          plan_subjects?: string | null
          plan_targets?: string | null
          plan_wrong_only?: boolean
          preferred_2fa?: string
          profile_visibility?: Json
          role?: string
          show_custom_overall?: boolean | null
          show_long_overall?: boolean | null
          show_overall?: boolean | null
          show_overall_date?: string | null
          skip_question_ids?: string | null
          subject_reset_at?: Json | null
          target_school?: string | null
          totp_enabled?: boolean
        }
        Update: {
          avatar_preset?: string | null
          avatar_url?: string | null
          created_at?: string
          daily_deadline?: string | null
          daily_reset_at?: string | null
          daily_targets?: string | null
          deadline?: string | null
          exam_status?: string | null
          goal_type?: string | null
          id?: string
          kp_order_pos?: string | null
          last_question_id?: string | null
          mfa_grace_until?: string | null
          mfa_validity_days?: number
          milestones?: Json | null
          nickname?: string | null
          onboarded_at?: string | null
          passkey_timeout_minutes?: number
          plan_categories?: string | null
          plan_goals?: Json | null
          plan_key_points?: string | null
          plan_reset_at?: string | null
          plan_rounds?: Json | null
          plan_scope?: Json | null
          plan_subjects?: string | null
          plan_targets?: string | null
          plan_wrong_only?: boolean
          preferred_2fa?: string
          profile_visibility?: Json
          role?: string
          show_custom_overall?: boolean | null
          show_long_overall?: boolean | null
          show_overall?: boolean | null
          show_overall_date?: string | null
          skip_question_ids?: string | null
          subject_reset_at?: Json | null
          target_school?: string | null
          totp_enabled?: boolean
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_login_tokens: {
        Row: {
          auth_code: string | null
          created_at: string
          device_info: string | null
          expires_at: string
          id: string
          secret_hash: string | null
          status: string
          token: string
          user_id: string | null
        }
        Insert: {
          auth_code?: string | null
          created_at?: string
          device_info?: string | null
          expires_at?: string
          id?: string
          secret_hash?: string | null
          status?: string
          token: string
          user_id?: string | null
        }
        Update: {
          auth_code?: string | null
          created_at?: string
          device_info?: string | null
          expires_at?: string
          id?: string
          secret_hash?: string | null
          status?: string
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_login_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_bank_items: {
        Row: {
          added_at: string
          bank_id: string
          id: string
          question_id: string
        }
        Insert: {
          added_at?: string
          bank_id: string
          id?: string
          question_id: string
        }
        Update: {
          added_at?: string
          bank_id?: string
          id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_items_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_bank_papers: {
        Row: {
          bank_id: string
          created_at: string
          created_by: string
          duration_min: number
          generated_at: string
          id: string
          kind: string
          name: string
          question_ids: string[]
          scope_type: string
          scope_values: Json
          subject: string[] | null
          template: Json
          updated_at: string
          year: number | null
        }
        Insert: {
          bank_id: string
          created_at?: string
          created_by: string
          duration_min?: number
          generated_at?: string
          id?: string
          kind: string
          name: string
          question_ids?: string[]
          scope_type: string
          scope_values?: Json
          subject?: string[] | null
          template?: Json
          updated_at?: string
          year?: number | null
        }
        Update: {
          bank_id?: string
          created_at?: string
          created_by?: string
          duration_min?: number
          generated_at?: string
          id?: string
          kind?: string
          name?: string
          question_ids?: string[]
          scope_type?: string
          scope_values?: Json
          subject?: string[] | null
          template?: Json
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_papers_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_papers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_banks: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_public: boolean
          logo_url: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean
          logo_url?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean
          logo_url?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_banks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_drafts: {
        Row: {
          created_at: string
          id: string
          payload: Json
          question_id: string | null
          question_text: string
          question_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          question_id?: string | null
          question_text?: string
          question_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          question_id?: string | null
          question_text?: string
          question_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_drafts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_dup_cache: {
        Row: {
          ans_fp: string
          len: number
          opts: string[]
          opts_fp: string
          question_id: string
          stem: string
          stem_fp: string
          subject: string
        }
        Insert: {
          ans_fp?: string
          len?: number
          opts?: string[]
          opts_fp?: string
          question_id: string
          stem?: string
          stem_fp?: string
          subject?: string
        }
        Update: {
          ans_fp?: string
          len?: number
          opts?: string[]
          opts_fp?: string
          question_id?: string
          stem?: string
          stem_fp?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_dup_cache_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_dup_reviews: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          note: string | null
          q1_id: string
          q2_id: string
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          note?: string | null
          q1_id: string
          q2_id: string
          status: string
          subject?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          note?: string | null
          q1_id?: string
          q2_id?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_dup_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_dup_reviews_q1_id_fkey"
            columns: ["q1_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_dup_reviews_q2_id_fkey"
            columns: ["q2_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_merge_log: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          kept_id: string
          merged_categories: Json | null
          reason: string | null
          removed_id: string
          score: number | null
          subject: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          kept_id: string
          merged_categories?: Json | null
          reason?: string | null
          removed_id: string
          score?: number | null
          subject?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          kept_id?: string
          merged_categories?: Json | null
          reason?: string | null
          removed_id?: string
          score?: number | null
          subject?: string
        }
        Relationships: []
      }
      question_meta_cache: {
        Row: {
          categories: Json
          id: boolean
          key_points_by_subject: Json
          subjects: Json
          updated_at: string
        }
        Insert: {
          categories?: Json
          id?: boolean
          key_points_by_subject?: Json
          subjects?: Json
          updated_at?: string
        }
        Update: {
          categories?: Json
          id?: boolean
          key_points_by_subject?: Json
          subjects?: Json
          updated_at?: string
        }
        Relationships: []
      }
      question_source_links: {
        Row: {
          anchor: string | null
          block_index: number
          created_at: string
          id: string
          label: string
          note: string
          origin: string
          page_no: number | null
          question_id: string
          snippet: string
          source: string
          source_id: string
          sub_label: string | null
          user_id: string
        }
        Insert: {
          anchor?: string | null
          block_index?: number
          created_at?: string
          id?: string
          label?: string
          note?: string
          origin?: string
          page_no?: number | null
          question_id: string
          snippet?: string
          source: string
          source_id: string
          sub_label?: string | null
          user_id: string
        }
        Update: {
          anchor?: string | null
          block_index?: number
          created_at?: string
          id?: string
          label?: string
          note?: string
          origin?: string
          page_no?: number | null
          question_id?: string
          snippet?: string
          source?: string
          source_id?: string
          sub_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_source_links_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          allow_unordered: boolean
          analysis: string | null
          answer_explanation: string | null
          case_questions: Json | null
          categories: Json | null
          category: string | null
          correct_answer: Json | null
          created_at: string
          created_by: string | null
          examples: Json | null
          execution_mode: string | null
          flagged_at: string | null
          id: string
          import_mode: string | null
          issue_flag: string
          issue_note: string | null
          item_count: number | null
          key_points: string | null
          options: Json
          paper: Json | null
          question_text: string
          question_type: string
          runtime_config: Json | null
          seq_number: number | null
          source_page: string | null
          subject: string | null
          test_cases: Json | null
          unordered_blanks: number[] | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          allow_unordered?: boolean
          analysis?: string | null
          answer_explanation?: string | null
          case_questions?: Json | null
          categories?: Json | null
          category?: string | null
          correct_answer?: Json | null
          created_at?: string
          created_by?: string | null
          examples?: Json | null
          execution_mode?: string | null
          flagged_at?: string | null
          id?: string
          import_mode?: string | null
          issue_flag?: string
          issue_note?: string | null
          item_count?: number | null
          key_points?: string | null
          options: Json
          paper?: Json | null
          question_text: string
          question_type?: string
          runtime_config?: Json | null
          seq_number?: number | null
          source_page?: string | null
          subject?: string | null
          test_cases?: Json | null
          unordered_blanks?: number[] | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          allow_unordered?: boolean
          analysis?: string | null
          answer_explanation?: string | null
          case_questions?: Json | null
          categories?: Json | null
          category?: string | null
          correct_answer?: Json | null
          created_at?: string
          created_by?: string | null
          examples?: Json | null
          execution_mode?: string | null
          flagged_at?: string | null
          id?: string
          import_mode?: string | null
          issue_flag?: string
          issue_note?: string | null
          item_count?: number | null
          key_points?: string | null
          options?: Json
          paper?: Json | null
          question_text?: string
          question_type?: string
          runtime_config?: Json | null
          seq_number?: number | null
          source_page?: string | null
          subject?: string | null
          test_cases?: Json | null
          unordered_blanks?: number[] | null
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_chunks: {
        Row: {
          anchor: string | null
          bbox: number[] | null
          block_index: number | null
          chunk_index: number
          content: string
          created_at: string
          embedded_at: string | null
          embedding: unknown
          id: number
          label: string
          page_no: number | null
          search_text: string | null
          source: string
          source_id: string
          sub_label: string | null
        }
        Insert: {
          anchor?: string | null
          bbox?: number[] | null
          block_index?: number | null
          chunk_index?: number
          content: string
          created_at?: string
          embedded_at?: string | null
          embedding?: unknown
          id?: number
          label?: string
          page_no?: number | null
          search_text?: string | null
          source: string
          source_id: string
          sub_label?: string | null
        }
        Update: {
          anchor?: string | null
          bbox?: number[] | null
          block_index?: number | null
          chunk_index?: number
          content?: string
          created_at?: string
          embedded_at?: string | null
          embedding?: unknown
          id?: number
          label?: string
          page_no?: number | null
          search_text?: string | null
          source?: string
          source_id?: string
          sub_label?: string | null
        }
        Relationships: []
      }
      resource_blocks: {
        Row: {
          bbox: number[] | null
          block_index: number
          block_type: string
          code_language: string | null
          created_at: string
          document_id: string
          heading_level: number
          id: number
          image_url: string | null
          page_no: number
          search_text: string | null
          table_html: string | null
          text: string
        }
        Insert: {
          bbox?: number[] | null
          block_index: number
          block_type?: string
          code_language?: string | null
          created_at?: string
          document_id: string
          heading_level?: number
          id?: number
          image_url?: string | null
          page_no: number
          search_text?: string | null
          table_html?: string | null
          text?: string
        }
        Update: {
          bbox?: number[] | null
          block_index?: number
          block_type?: string
          code_language?: string | null
          created_at?: string
          document_id?: string
          heading_level?: number
          id?: number
          image_url?: string | null
          page_no?: number
          search_text?: string | null
          table_html?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_blocks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "resource_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_documents: {
        Row: {
          abstract: string
          authors: string
          created_at: string
          doc_type: string
          doi: string
          id: string
          is_published: boolean
          language: string
          markdown: string
          parse_error: string | null
          parse_mode: string
          parse_status: string
          pdf_key: string
          pdf_page_urls: string | null
          pdf_total_pages: number | null
          pdf_url: string
          pub_year: number | null
          search_text: string | null
          source: string
          subject: string
          tags: string[]
          title: string
          toc_source: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          abstract?: string
          authors?: string
          created_at?: string
          doc_type?: string
          doi?: string
          id?: string
          is_published?: boolean
          language?: string
          markdown?: string
          parse_error?: string | null
          parse_mode?: string
          parse_status?: string
          pdf_key?: string
          pdf_page_urls?: string | null
          pdf_total_pages?: number | null
          pdf_url?: string
          pub_year?: number | null
          search_text?: string | null
          source?: string
          subject?: string
          tags?: string[]
          title: string
          toc_source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          abstract?: string
          authors?: string
          created_at?: string
          doc_type?: string
          doi?: string
          id?: string
          is_published?: boolean
          language?: string
          markdown?: string
          parse_error?: string | null
          parse_mode?: string
          parse_status?: string
          pdf_key?: string
          pdf_page_urls?: string | null
          pdf_total_pages?: number | null
          pdf_url?: string
          pub_year?: number | null
          search_text?: string | null
          source?: string
          subject?: string
          tags?: string[]
          title?: string
          toc_source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_kp_scopes: {
        Row: {
          block_from: number
          block_to: number
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          kp: string
          note: string
          page_from: number
          page_to: number
          subject: string
          toc_level: number
          toc_title: string
          updated_at: string
        }
        Insert: {
          block_from: number
          block_to: number
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          kp: string
          note?: string
          page_from?: number
          page_to?: number
          subject: string
          toc_level?: number
          toc_title?: string
          updated_at?: string
        }
        Update: {
          block_from?: number
          block_to?: number
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          kp?: string
          note?: string
          page_from?: number
          page_to?: number
          subject?: string
          toc_level?: number
          toc_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_kp_scopes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_kp_scopes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "resource_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_parts: {
        Row: {
          created_at: string
          document_id: string
          id: string
          markdown: string
          page_from: number
          page_to: number
          page_urls: string | null
          parse_error: string | null
          parse_mode: string
          parse_status: string
          part_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          markdown?: string
          page_from: number
          page_to: number
          page_urls?: string | null
          parse_error?: string | null
          parse_mode?: string
          parse_status?: string
          part_index: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          markdown?: string
          page_from?: number
          page_to?: number
          page_urls?: string | null
          parse_error?: string | null
          parse_mode?: string
          parse_status?: string
          part_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_parts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "resource_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_toc_entries: {
        Row: {
          block_index: number | null
          created_at: string
          document_id: string
          id: number
          level: number
          page_no: number
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          block_index?: number | null
          created_at?: string
          document_id: string
          id?: number
          level?: number
          page_no?: number
          sort_order: number
          title?: string
          updated_at?: string
        }
        Update: {
          block_index?: number | null
          created_at?: string
          document_id?: string
          id?: number
          level?: number
          page_no?: number
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_toc_entries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "resource_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      study_room_members: {
        Row: {
          id: string
          joined_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_room_reminders: {
        Row: {
          id: string
          reminded_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          reminded_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          reminded_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_room_reminders_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_room_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_rooms: {
        Row: {
          created_at: string
          description: string
          id: string
          invite_code: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          invite_code: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invite_code?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_rooms_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_explanations: {
        Row: {
          content: string
          subject: string
          updated_at: string
        }
        Insert: {
          content: string
          subject: string
          updated_at?: string
        }
        Update: {
          content?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          code: string
          created_at: string
          error: string | null
          execution_time_ms: number | null
          id: string
          judge_source: string | null
          language: string
          question_id: string
          results: Json | null
          status: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          error?: string | null
          execution_time_ms?: number | null
          id?: string
          judge_source?: string | null
          language: string
          question_id: string
          results?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          error?: string | null
          execution_time_ms?: number | null
          id?: string
          judge_source?: string | null
          language?: string
          question_id?: string
          results?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_answers: {
        Row: {
          answered_at: string
          exam_session_id: string | null
          id: string
          is_correct: boolean
          is_public: boolean
          mode: string
          note: string | null
          question_id: string
          selected_answer: Json
          source: string | null
          user_id: string
          wrong_reason: string | null
        }
        Insert: {
          answered_at?: string
          exam_session_id?: string | null
          id?: string
          is_correct: boolean
          is_public?: boolean
          mode: string
          note?: string | null
          question_id: string
          selected_answer: Json
          source?: string | null
          user_id: string
          wrong_reason?: string | null
        }
        Update: {
          answered_at?: string
          exam_session_id?: string | null
          id?: string
          is_correct?: boolean
          is_public?: boolean
          mode?: string
          note?: string | null
          question_id?: string
          selected_answer?: Json
          source?: string | null
          user_id?: string
          wrong_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_answers_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_daily_stats: {
        Row: {
          correct: number
          date: string
          hourly: number[]
          question_type: string
          subject: string
          total: number
          user_id: string
        }
        Insert: {
          correct?: number
          date: string
          hourly?: number[]
          question_type?: string
          subject?: string
          total?: number
          user_id: string
        }
        Update: {
          correct?: number
          date?: string
          hourly?: number[]
          question_type?: string
          subject?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_daily_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_excluded_questions: {
        Row: {
          created_at: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_excluded_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_excluded_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mfa_sessions: {
        Row: {
          expires_at: string
          method: string
          session_id: string
          user_id: string
          verified_at: string
        }
        Insert: {
          expires_at: string
          method?: string
          session_id: string
          user_id: string
          verified_at?: string
        }
        Update: {
          expires_at?: string
          method?: string
          session_id?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mfa_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_plugins: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          plugin_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          plugin_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          plugin_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_plugins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          practice_filters: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          practice_filters?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          practice_filters?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prompts: {
        Row: {
          body: string
          created_at: string
          enabled: boolean
          id: string
          prompt_key: string
          title: string | null
          updated_at: string
          user_id: string
          variables: string[]
        }
        Insert: {
          body: string
          created_at?: string
          enabled?: boolean
          id?: string
          prompt_key: string
          title?: string | null
          updated_at?: string
          user_id: string
          variables?: string[]
        }
        Update: {
          body?: string
          created_at?: string
          enabled?: boolean
          id?: string
          prompt_key?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          variables?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "user_prompts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_recovery_codes: {
        Row: {
          codes: string[]
          user_id: string
        }
        Insert: {
          codes?: string[]
          user_id: string
        }
        Update: {
          codes?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_recovery_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_totp: {
        Row: {
          totp_secret: string
          user_id: string
        }
        Insert: {
          totp_secret: string
          user_id: string
        }
        Update: {
          totp_secret?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_totp_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_trusted_devices: {
        Row: {
          created_at: string
          custom_name: string | null
          device_id: string
          device_info: Json | null
          device_name: string | null
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          device_id: string
          device_info?: Json | null
          device_name?: string | null
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          device_id?: string
          device_info?: Json | null
          device_name?: string | null
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_trusted_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_usage_overview: { Args: { p_days?: number }; Returns: Json }
      auth_attempt: {
        Args: { p_kind: string; p_user_id: string; p_window_seconds?: number }
        Returns: number
      }
      backfill_daily_stats: { Args: never; Returns: undefined }
      cleanup_expired_challenges: { Args: never; Returns: undefined }
      cleanup_expired_devices: { Args: never; Returns: undefined }
      cleanup_mfa_expired: { Args: never; Returns: undefined }
      compose_exam: {
        Args: {
          p_bank_id?: string
          p_categories: string[]
          p_key_points?: string[]
          p_order_mode?: string
          p_sample_mode?: string
          p_scope_categories?: string[]
          p_sections: Json
          p_subjects: string[]
          p_types?: string[]
        }
        Returns: Json
      }
      count_question_items: {
        Args: {
          p_category?: string
          p_import_mode?: string
          p_issue_flag?: string
          p_key_points?: string
          p_question_type?: string
          p_search?: string
          p_subject?: string
          p_verified?: boolean
        }
        Returns: Json
      }
      create_study_room: {
        Args: { p_description?: string; p_name: string }
        Returns: {
          created_at: string
          description: string
          id: string
          invite_code: string
          name: string
          owner_id: string
        }[]
      }
      dup_arr_jaccard: { Args: { a: string[]; b: string[] }; Returns: number }
      dup_question_json: { Args: { p_id: string }; Returns: Json }
      dup_score_prob: { Args: { p_score: number }; Returns: number }
      get_accuracy_change: {
        Args: { p_user_id: string }
        Returns: {
          subject: string
          today_correct: number
          today_total: number
          yesterday_correct: number
          yesterday_total: number
        }[]
      }
      get_daily_completion: {
        Args: { p_days?: number; p_subjects?: string[]; p_user_id: string }
        Returns: {
          count: number
          day: string
          subject: string
        }[]
      }
      get_excluded_kp_questions: {
        Args: { p_kp: string; p_user_id: string }
        Returns: Json
      }
      get_kp_exclusion_stats: {
        Args: { p_kps: string[]; p_user_id: string }
        Returns: Json
      }
      get_kp_scope_progress: {
        Args: {
          p_kp_scope: Json
          p_plan_reset_at?: string
          p_subject_resets?: Json
          p_today_since?: string
          p_user_id: string
        }
        Returns: {
          done_all: number
          done_today: number
          subject: string
          total: number
        }[]
      }
      get_plan_stats: {
        Args: { p_plan: Json; p_user_id: string }
        Returns: {
          attempts: number
          done_dates: Json
          subject: string
          total: number
        }[]
      }
      get_profile_cards: {
        Args: { user_ids: string[] }
        Returns: {
          avatar_preset: string
          avatar_url: string
          id: string
          nickname: string
        }[]
      }
      get_profile_nicknames: {
        Args: { user_ids: string[] }
        Returns: {
          id: string
          nickname: string
        }[]
      }
      get_public_profiles: {
        Args: { user_ids: string[] }
        Returns: {
          avatar_preset: string
          avatar_url: string
          exam_status: string
          goal_type: string
          id: string
          nickname: string
          target_school: string
        }[]
      }
      get_question_meta: { Args: { p_subject?: string }; Returns: Json }
      get_random_question_id: {
        Args: {
          p_categories?: string[]
          p_question_type?: string
          p_subjects?: string[]
          p_user_id: string
        }
        Returns: string
      }
      get_random_question_id_mixed: {
        Args: {
          p_categories?: string[]
          p_question_type?: string
          p_subjects?: string[]
          p_user_id: string
        }
        Returns: string
      }
      get_review_count: {
        Args: { p_subjects?: string[]; p_user_id: string }
        Returns: number
      }
      get_review_pool_count: {
        Args: { p_user_id: string; p_windows: Json }
        Returns: number
      }
      get_sessions_answered: {
        Args: { p_starts?: Json; p_user_id: string }
        Returns: {
          answered: number
          session_key: string
        }[]
      }
      get_subject_progress:
        | {
            Args: {
              p_plan_reset_at?: string
              p_subjects?: string[]
              p_today_since?: string
              p_user_id: string
            }
            Returns: {
              done_all: number
              done_today: number
              subject: string
              total: number
            }[]
          }
        | {
            Args: {
              p_plan_reset_at?: string
              p_subject_resets?: Json
              p_subjects?: string[]
              p_today_since?: string
              p_user_id: string
            }
            Returns: {
              done_all: number
              done_today: number
              missing_kp: number
              subject: string
              total: number
            }[]
          }
      get_type_accuracy: {
        Args: { p_subjects?: string[]; p_user_id: string }
        Returns: {
          correct: number
          question_type: string
          subject: string
          total: number
        }[]
      }
      get_user_email: { Args: { user_id: string }; Returns: string }
      get_user_email_confirmed: { Args: { user_id: string }; Returns: boolean }
      get_user_last_online: { Args: { user_id: string }; Returns: string }
      get_user_last_sign_in: { Args: { user_id: string }; Returns: string }
      get_user_providers: { Args: { user_id: string }; Returns: string[] }
      is_admin: { Args: never; Returns: boolean }
      is_study_room_member: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
      is_study_room_owner: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
      join_study_room: {
        Args: { p_code: string }
        Returns: {
          id: string
          joined_at: string
          room_id: string
          user_id: string
        }[]
      }
      keep_dup_group: {
        Args: { p_ids: string[]; p_note?: string }
        Returns: Json
      }
      kp_build_sort_key: { Args: { p_code: string }; Returns: string }
      load_practice_session: {
        Args: { p_session_key: string; p_user_id: string }
        Returns: Json
      }
      merge_dup_group: {
        Args: { p_keep: string; p_reason?: string; p_removes: string[] }
        Returns: Json
      }
      merge_dup_questions: {
        Args: { p_keep: string; p_reason?: string; p_remove: string }
        Returns: Json
      }
      norm_dup_compact: { Args: { p_text: string }; Returns: string }
      norm_dup_stem: { Args: { p_text: string }; Returns: string }
      qr_login_claim: {
        Args: { p_secret: string; p_token: string }
        Returns: string
      }
      qr_login_confirm: {
        Args: { p_device_info?: string; p_token: string }
        Returns: boolean
      }
      qr_login_status: {
        Args: { p_secret: string; p_token: string }
        Returns: string
      }
      rag_admin_stats: {
        Args: never
        Returns: {
          chunks: number
          content_bytes: number
          embedded: number
          last_created: string
          last_embedded: string
          source: string
          unembedded: number
        }[]
      }
      rag_clear_index: { Args: { p_source?: string }; Returns: number }
      refresh_dup_cache: { Args: { p_subject?: string }; Returns: undefined }
      refresh_kp_question_map: { Args: never; Returns: undefined }
      refresh_question_meta_cache: { Args: never; Returns: undefined }
      reset_resource_toc: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      save_dup_review: {
        Args: { p_note?: string; p_q1: string; p_q2: string; p_status: string }
        Returns: undefined
      }
      save_kp_question_refs: {
        Args: { p_kp: string; p_refs: Json; p_subject: string }
        Returns: number
      }
      save_kp_resource_refs: {
        Args: { p_kp: string; p_refs: Json; p_subject: string }
        Returns: number
      }
      save_resource_toc: {
        Args: { p_document_id: string; p_entries: Json }
        Returns: number
      }
      scan_question_duplicates: {
        Args: { p_limit?: number; p_min_sim?: number; p_subject?: string }
        Returns: Json
      }
      search_rag: {
        Args: {
          p_embedding?: string
          p_limit?: number
          p_query: string
          p_source_ids?: string[]
          p_sources?: string[]
          p_terms?: string[]
        }
        Returns: {
          anchor: string
          bbox: number[]
          block_index: number
          content: string
          id: number
          label: string
          page_no: number
          score: number
          source: string
          source_id: string
          sub_label: string
          txt_rank: number
          vec_rank: number
        }[]
      }
      search_resource_blocks: {
        Args: {
          p_doc_type?: string
          p_document_id?: string
          p_limit?: number
          p_query: string
          p_subject?: string
          p_tag?: string
        }
        Returns: {
          bbox: number[]
          block_index: number
          block_type: string
          doc_title: string
          document_id: string
          heading_level: number
          page_no: number
          score: number
          snippet: string
          total_hits: number
        }[]
      }
      search_resource_documents: {
        Args: {
          p_doc_type?: string
          p_limit?: number
          p_offset?: number
          p_query: string
          p_subject?: string
          p_tag?: string
        }
        Returns: {
          abstract: string
          authors: string
          created_at: string
          doc_type: string
          id: string
          parse_status: string
          pdf_total_pages: number
          pub_year: number
          snippet: string
          source: string
          subject: string
          tags: string[]
          title: string
          total_hits: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_sequential_session: {
        Args: {
          p_ignore_answered?: boolean
          p_kps: string[]
          p_question_type?: string
          p_session_key?: string
          p_subjects?: string[]
          p_user_id: string
        }
        Returns: Json
      }
      sync_dup_cache_question: { Args: { p_id: string }; Returns: undefined }
      unlink_oauth_identity: {
        Args: { p_provider: string; p_user_id?: string }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
