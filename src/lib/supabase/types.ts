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
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          phone: string | null
          location: string | null
          avatar_url: string | null
          subscription_tier: 'free' | 'pro' | 'enterprise'
          subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing'
          notify_tips: boolean
          notify_updates: boolean
          notify_weekly: boolean
          notify_marketing: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          phone?: string | null
          location?: string | null
          avatar_url?: string | null
          subscription_tier?: 'free' | 'pro' | 'enterprise'
          subscription_status?: 'active' | 'canceled' | 'past_due' | 'trialing'
          notify_tips?: boolean
          notify_updates?: boolean
          notify_weekly?: boolean
          notify_marketing?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          phone?: string | null
          location?: string | null
          avatar_url?: string | null
          subscription_tier?: 'free' | 'pro' | 'enterprise'
          subscription_status?: 'active' | 'canceled' | 'past_due' | 'trialing'
          notify_tips?: boolean
          notify_updates?: boolean
          notify_weekly?: boolean
          notify_marketing?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          user_id: string
          type: 'primary_cv' | 'master_cv'
          file_name: string
          file_type: 'pdf' | 'docx'
          file_size: number | null
          storage_path: string | null
          raw_text: string | null
          sections: Json
          all_skills: string[]
          all_experiences: string[]
          all_education: string[]
          structured_data: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'primary_cv' | 'master_cv'
          file_name: string
          file_type: 'pdf' | 'docx'
          file_size?: number | null
          storage_path?: string | null
          raw_text?: string | null
          sections?: Json
          all_skills?: string[]
          all_experiences?: string[]
          all_education?: string[]
          structured_data?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'primary_cv' | 'master_cv'
          file_name?: string
          file_type?: 'pdf' | 'docx'
          file_size?: number | null
          storage_path?: string | null
          raw_text?: string | null
          sections?: Json
          all_skills?: string[]
          all_experiences?: string[]
          all_education?: string[]
          structured_data?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      profile_photos: {
        Row: {
          id: string
          user_id: string
          file_name: string
          storage_path: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          file_name: string
          storage_path: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          file_name?: string
          storage_path?: string
          created_at?: string
        }
      }
      application_sessions: {
        Row: {
          id: string
          user_id: string
          job_title: string | null
          company: string | null
          job_description: string
          match_score: number | null
          matching_skills: string[]
          missing_skills: string[]
          suggestions: string[]
          requirements: Json | null
          gaps: Json | null
          generated_cv: Json | null
          cover_letter: Json | null
          email: Json | null
          company_research: Json | null
          cv_edits: Json
          optimized_pdf_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          job_title?: string | null
          company?: string | null
          job_description: string
          match_score?: number | null
          matching_skills?: string[]
          missing_skills?: string[]
          suggestions?: string[]
          requirements?: Json | null
          gaps?: Json | null
          generated_cv?: Json | null
          cover_letter?: Json | null
          email?: Json | null
          company_research?: Json | null
          cv_edits?: Json
          optimized_pdf_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          job_title?: string | null
          company?: string | null
          job_description?: string
          match_score?: number | null
          matching_skills?: string[]
          missing_skills?: string[]
          suggestions?: string[]
          requirements?: Json | null
          gaps?: Json | null
          generated_cv?: Json | null
          cover_letter?: Json | null
          email?: Json | null
          company_research?: Json | null
          cv_edits?: Json
          optimized_pdf_path?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          session_id: string
          user_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          actions: Json
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          actions?: Json
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          role?: 'user' | 'assistant' | 'system'
          content?: string
          actions?: Json
          created_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          tier: 'free' | 'pro' | 'enterprise'
          status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          trial_start: string | null
          trial_end: string | null
          applications_used: number
          applications_limit: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tier: 'free' | 'pro' | 'enterprise'
          status?: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          applications_used?: number
          applications_limit?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tier?: 'free' | 'pro' | 'enterprise'
          status?: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          applications_used?: number
          applications_limit?: number
          created_at?: string
          updated_at?: string
        }
      }
      connected_accounts: {
        Row: {
          id: string
          user_id: string
          provider: 'google' | 'linkedin' | 'github'
          provider_user_id: string
          provider_email: string | null
          access_token: string | null
          refresh_token: string | null
          token_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: 'google' | 'linkedin' | 'github'
          provider_user_id: string
          provider_email?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: 'google' | 'linkedin' | 'github'
          provider_user_id?: string
          provider_email?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
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

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

// Convenience types
export type Profile = Tables<'profiles'>
export type Document = Tables<'documents'>
export type ProfilePhoto = Tables<'profile_photos'>
export type ApplicationSession = Tables<'application_sessions'>
export type ChatMessage = Tables<'chat_messages'>
export type Subscription = Tables<'subscriptions'>
export type ConnectedAccount = Tables<'connected_accounts'>
