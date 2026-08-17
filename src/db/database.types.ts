export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      platform_users: {
        Row: {
          user_id: string
          global_role: "wai_admin" | "standard"
          status: "active" | "suspended" | "disabled"
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          user_id: string
          global_role: "wai_admin" | "standard"
          status: "active" | "suspended" | "disabled"
        }>
        Update: Partial<{
          global_role: "wai_admin" | "standard"
          status: "active" | "suspended" | "disabled"
        }>
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          timezone: string
          locale: string
          status: "active" | "inactive" | "archived"
          settings_json: Json
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          name: string
          slug: string
          timezone: string
          locale: string
          status: "active" | "inactive" | "archived"
          settings_json: Json
        }>
        Update: Partial<{
          name: string
          timezone: string
          locale: string
          status: "active" | "inactive" | "archived"
          settings_json: Json
        }>
      }
      organization_members: {
        Row: {
          organization_id: string
          user_id: string
          role: "organization_owner" | "organization_operator" | "organization_viewer"
          status: "active" | "invited" | "suspended"
          created_at: string
        }
        Insert: Partial<{
          organization_id: string
          user_id: string
          role: "organization_owner" | "organization_operator" | "organization_viewer"
          status: "active" | "invited" | "suspended"
        }>
        Update: Partial<{
          role: "organization_owner" | "organization_operator" | "organization_viewer"
          status: "active" | "invited" | "suspended"
        }>
      }
      audit_logs: {
        Row: {
          id: string
          organization_id: string | null
          actor_user_id: string | null
          actor_type: "user" | "system" | "admin"
          action: string
          entity_type: string
          entity_id: string
          before_data: Json | null
          after_data: Json | null
          metadata: Json
          correlation_id: string
          created_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string | null
          actor_user_id: string | null
          actor_type: "user" | "system" | "admin"
          action: string
          entity_type: string
          entity_id: string
          before_data: Json | null
          after_data: Json | null
          metadata: Json
          correlation_id: string
        }>
        Update: Partial<{
          organization_id: string | null
          actor_user_id: string | null
          actor_type: "user" | "system" | "admin"
          action: string
          entity_type: string
          entity_id: string
          before_data: Json | null
          after_data: Json | null
          metadata: Json
          correlation_id: string
        }>
      }
      digital_employees: {
        Row: {
          id: string
          organization_id: string
          name: string
          personality_summary: string
          language: string
          communication_tone: "formal" | "cordial_empathic" | "direct"
          avatar_placeholder_url: string
          is_default: boolean
          status: "active" | "inactive" | "archived"
          enable_ai_humanization: boolean
          settings_json: Json
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          name: string
          personality_summary: string
          language: string
          communication_tone: "formal" | "cordial_empathic" | "direct"
          avatar_placeholder_url: string
          is_default: boolean
          status: "active" | "inactive" | "archived"
          enable_ai_humanization: boolean
          settings_json: Json
        }>
        Update: Partial<{
          name: string
          personality_summary: string
          language: string
          communication_tone: "formal" | "cordial_empathic" | "direct"
          avatar_placeholder_url: string
          is_default: boolean
          status: "active" | "inactive" | "archived"
          enable_ai_humanization: boolean
          settings_json: Json
        }>
      }
      customers: {
        Row: {
          id: string
          organization_id: string
          first_name: string
          last_name: string
          phone_normalized: string
          email: string | null
          birth_date: string | null
          marketing_consent: boolean
          notes: string | null
          status: "active" | "archived" | "blocked"
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          first_name: string
          last_name: string
          phone_normalized: string
          email: string | null
          birth_date: string | null
          marketing_consent: boolean
          notes: string | null
          status: "active" | "archived" | "blocked"
        }>
        Update: Partial<{
          first_name: string
          last_name: string
          phone_normalized: string
          email: string | null
          birth_date: string | null
          marketing_consent: boolean
          notes: string | null
          status: "active" | "archived" | "blocked"
        }>
      }
      professionals: {
        Row: {
          id: string
          organization_id: string
          name: string
          title: string
          email: string | null
          phone: string | null
          status: "active" | "inactive"
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          name: string
          title: string
          email: string | null
          phone: string | null
          status: "active" | "inactive"
        }>
        Update: Partial<{
          name: string
          title: string
          email: string | null
          phone: string | null
          status: "active" | "inactive"
        }>
      }
      services: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          duration_minutes: number
          price_cents: number
          buffer_after_minutes: number
          status: "active" | "inactive"
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          name: string
          description: string | null
          duration_minutes: number
          price_cents: number
          buffer_after_minutes: number
          status: "active" | "inactive"
        }>
        Update: Partial<{
          name: string
          description: string | null
          duration_minutes: number
          price_cents: number
          buffer_after_minutes: number
          status: "active" | "inactive"
        }>
      }
      professional_services: {
        Row: {
          organization_id: string
          professional_id: string
          service_id: string
        }
        Insert: {
          organization_id: string
          professional_id: string
          service_id: string
        }
        Update: Partial<{
          organization_id: string
          professional_id: string
          service_id: string
        }>
      }
      availability_rules: {
        Row: {
          id: string
          organization_id: string
          professional_id: string
          day_of_week: number
          start_time: string
          end_time: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          professional_id: string
          day_of_week: number
          start_time: string
          end_time: string
          is_active: boolean
        }>
        Update: Partial<{
          day_of_week: number
          start_time: string
          end_time: string
          is_active: boolean
        }>
      }
      appointments: {
        Row: {
          id: string
          organization_id: string
          customer_id: string
          professional_id: string
          service_id: string
          start_at: string
          end_at: string
          status: "held" | "confirmed" | "cancelled" | "completed" | "no_show" | "expired"
          notes: string | null
          created_by_actor_type: "user" | "customer" | "system" | "admin"
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          customer_id: string
          professional_id: string
          service_id: string
          start_at: string
          end_at: string
          status: "held" | "confirmed" | "cancelled" | "completed" | "no_show" | "expired"
          notes: string | null
          created_by_actor_type: "user" | "customer" | "system" | "admin"
        }>
        Update: Partial<{
          start_at: string
          end_at: string
          status: "held" | "confirmed" | "cancelled" | "completed" | "no_show" | "expired"
          notes: string | null
        }>
      }
      appointment_events: {
        Row: {
          id: string
          organization_id: string
          appointment_id: string
          event_type: string
          old_status: string | null
          new_status: string | null
          actor_user_id: string | null
          metadata: Json
          created_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          appointment_id: string
          event_type: string
          old_status: string | null
          new_status: string | null
          actor_user_id: string | null
          metadata: Json
        }>
        Update: Partial<{
          event_type: string
          old_status: string | null
          new_status: string | null
          actor_user_id: string | null
          metadata: Json
        }>
      }
      business_rules: {
        Row: {
          id: string
          organization_id: string
          cancellation_policy: Json
          standard_messages: Json
          response_rules: Json
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          cancellation_policy: Json
          standard_messages: Json
          response_rules: Json
        }>
        Update: Partial<{
          cancellation_policy: Json
          standard_messages: Json
          response_rules: Json
        }>
      }
      closures: {
        Row: {
          id: string
          organization_id: string
          professional_id: string | null
          start_at: string
          end_at: string
          reason: string
          closure_type: "holiday" | "vacation" | "blocked_slot"
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          professional_id: string | null
          start_at: string
          end_at: string
          reason: string
          closure_type: "holiday" | "vacation" | "blocked_slot"
        }>
        Update: Partial<{
          start_at: string
          end_at: string
          reason: string
          closure_type: "holiday" | "vacation" | "blocked_slot"
        }>
      }
      conversations: {
        Row: {
          id: string
          organization_id: string
          customer_id: string | null
          channel: "webchat" | "whatsapp" | "instagram" | "sms"
          status: "active" | "waiting_customer" | "human_handoff" | "closed"
          workflow_state: Json | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          customer_id: string | null
          channel: "webchat" | "whatsapp" | "instagram" | "sms"
          status: "active" | "waiting_customer" | "human_handoff" | "closed"
          workflow_state: Json | null
        }>
        Update: Partial<{
          customer_id: string | null
          channel: "webchat" | "whatsapp" | "instagram" | "sms"
          status: "active" | "waiting_customer" | "human_handoff" | "closed"
          workflow_state: Json | null
        }>
      }
      messages: {
        Row: {
          id: string
          organization_id: string
          conversation_id: string
          role: "customer" | "assistant" | "system"
          content: string
          metadata: Json
          created_at: string
        }
        Insert: Partial<{
          id: string
          organization_id: string
          conversation_id: string
          role: "customer" | "assistant" | "system"
          content: string
          metadata: Json
        }>
        Update: Partial<{
          role: "customer" | "assistant" | "system"
          content: string
          metadata: Json
        }>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
