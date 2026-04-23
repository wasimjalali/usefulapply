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
          linkedin_url: string | null
          github_url: string | null
          portfolio_url: string | null
          website_url: string | null
          date_of_birth: string | null
          nationality: string | null
          subscription_tier: 'free' | 'starter' | 'plus' | 'max' | 'pro' | 'enterprise'
          subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing'
          notify_tips: boolean
          notify_updates: boolean
          notify_weekly: boolean
          notify_marketing: boolean
          job_searches_used: number
          job_searches_reset_at: string
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
          linkedin_url?: string | null
          github_url?: string | null
          portfolio_url?: string | null
          website_url?: string | null
          date_of_birth?: string | null
          nationality?: string | null
          subscription_tier?: 'free' | 'starter' | 'plus' | 'max' | 'pro' | 'enterprise'
          subscription_status?: 'active' | 'canceled' | 'past_due' | 'trialing'
          notify_tips?: boolean
          notify_updates?: boolean
          notify_weekly?: boolean
          notify_marketing?: boolean
          job_searches_used?: number
          job_searches_reset_at?: string
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
          linkedin_url?: string | null
          github_url?: string | null
          portfolio_url?: string | null
          website_url?: string | null
          date_of_birth?: string | null
          nationality?: string | null
          subscription_tier?: 'free' | 'starter' | 'plus' | 'max' | 'pro' | 'enterprise'
          subscription_status?: 'active' | 'canceled' | 'past_due' | 'trialing'
          notify_tips?: boolean
          notify_updates?: boolean
          notify_weekly?: boolean
          notify_marketing?: boolean
          job_searches_used?: number
          job_searches_reset_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      job_feed_settings: {
        Row: {
          user_id: string
          enabled: boolean
          consent_accepted_at: string | null
          user_timezone: string
          delivery_hour_local: number
          target_market: 'us' | 'canada' | 'us_canada'
          target_roles: string[]
          adjacent_roles_enabled: boolean
          adjacent_roles: string[]
          preferred_locations: string[]
          remote_preference: 'remote_only' | 'remote_first' | 'hybrid' | 'onsite' | 'flexible'
          salary_floor: number | null
          languages: string[]
          seniority_target: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'staff' | 'manager' | null
          employment_types: Array<'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary'>
          work_authorization_status: 'authorized' | 'needs_sponsorship' | 'open_to_both' | null
          aggressiveness: 'strict' | 'balanced' | 'broad'
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          enabled?: boolean
          consent_accepted_at?: string | null
          user_timezone?: string
          delivery_hour_local?: number
          target_market?: 'us' | 'canada' | 'us_canada'
          target_roles?: string[]
          adjacent_roles_enabled?: boolean
          adjacent_roles?: string[]
          preferred_locations?: string[]
          remote_preference?: 'remote_only' | 'remote_first' | 'hybrid' | 'onsite' | 'flexible'
          salary_floor?: number | null
          languages?: string[]
          seniority_target?: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'staff' | 'manager' | null
          employment_types?: Array<'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary'>
          work_authorization_status?: 'authorized' | 'needs_sponsorship' | 'open_to_both' | null
          aggressiveness?: 'strict' | 'balanced' | 'broad'
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          enabled?: boolean
          consent_accepted_at?: string | null
          user_timezone?: string
          delivery_hour_local?: number
          target_market?: 'us' | 'canada' | 'us_canada'
          target_roles?: string[]
          adjacent_roles_enabled?: boolean
          adjacent_roles?: string[]
          preferred_locations?: string[]
          remote_preference?: 'remote_only' | 'remote_first' | 'hybrid' | 'onsite' | 'flexible'
          salary_floor?: number | null
          languages?: string[]
          seniority_target?: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'staff' | 'manager' | null
          employment_types?: Array<'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary'>
          work_authorization_status?: 'authorized' | 'needs_sponsorship' | 'open_to_both' | null
          aggressiveness?: 'strict' | 'balanced' | 'broad'
          created_at?: string
          updated_at?: string
        }
      }
      job_feed_runs: {
        Row: {
          id: string
          user_id: string
          local_date: string
          local_timezone: string
          delivery_hour_local: number
          trigger_source: string
          status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
          idempotency_key: string
          started_at: string | null
          completed_at: string | null
          error_message: string | null
          result_summary: string | null
          raw_jobs_fetched: number
          jobs_after_prefilter: number
          ranked_jobs_count: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          local_date: string
          local_timezone: string
          delivery_hour_local: number
          trigger_source?: string
          status?: 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
          idempotency_key: string
          started_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          result_summary?: string | null
          raw_jobs_fetched?: number
          jobs_after_prefilter?: number
          ranked_jobs_count?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          local_date?: string
          local_timezone?: string
          delivery_hour_local?: number
          trigger_source?: string
          status?: 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
          idempotency_key?: string
          started_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          result_summary?: string | null
          raw_jobs_fetched?: number
          jobs_after_prefilter?: number
          ranked_jobs_count?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      job_feed_raw_fetches: {
        Row: {
          id: string
          run_id: string
          user_id: string
          provider: string
          status: 'completed' | 'no_results' | 'failed'
          query_text: string
          market: 'us' | 'canada' | 'us_canada'
          country_code: string | null
          language_code: string | null
          request_location: string | null
          request_filters: string[]
          page_number: number
          query_context: Json
          request_params: Json
          response_payload: Json
          response_error: string | null
          fetched_jobs_count: number
          next_page_token: string | null
          fetched_at: string
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          user_id: string
          provider?: string
          status?: 'completed' | 'no_results' | 'failed'
          query_text: string
          market: 'us' | 'canada' | 'us_canada'
          country_code?: string | null
          language_code?: string | null
          request_location?: string | null
          request_filters?: string[]
          page_number?: number
          query_context?: Json
          request_params?: Json
          response_payload?: Json
          response_error?: string | null
          fetched_jobs_count?: number
          next_page_token?: string | null
          fetched_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          user_id?: string
          provider?: string
          status?: 'completed' | 'no_results' | 'failed'
          query_text?: string
          market?: 'us' | 'canada' | 'us_canada'
          country_code?: string | null
          language_code?: string | null
          request_location?: string | null
          request_filters?: string[]
          page_number?: number
          query_context?: Json
          request_params?: Json
          response_payload?: Json
          response_error?: string | null
          fetched_jobs_count?: number
          next_page_token?: string | null
          fetched_at?: string
          created_at?: string
        }
      }
      job_feed_canonical_jobs: {
        Row: {
          id: string
          canonical_key: string
          source_provider: string
          source_job_id: string | null
          title: string
          title_normalized: string
          company: string
          company_normalized: string
          location_text: string | null
          location_normalized: string | null
          work_mode: 'remote' | 'hybrid' | 'onsite' | 'unknown'
          employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | null
          salary_text: string | null
          salary_min: number | null
          salary_max: number | null
          salary_currency: string | null
          description: string | null
          apply_url: string | null
          source_url: string | null
          posted_at_text: string | null
          freshness_days: number | null
          source_identifiers: Json
          first_seen_at: string
          last_seen_at: string
          last_raw_fetch_id: string | null
          times_seen: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          canonical_key: string
          source_provider?: string
          source_job_id?: string | null
          title: string
          title_normalized: string
          company: string
          company_normalized: string
          location_text?: string | null
          location_normalized?: string | null
          work_mode?: 'remote' | 'hybrid' | 'onsite' | 'unknown'
          employment_type?: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | null
          salary_text?: string | null
          salary_min?: number | null
          salary_max?: number | null
          salary_currency?: string | null
          description?: string | null
          apply_url?: string | null
          source_url?: string | null
          posted_at_text?: string | null
          freshness_days?: number | null
          source_identifiers?: Json
          first_seen_at?: string
          last_seen_at?: string
          last_raw_fetch_id?: string | null
          times_seen?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          canonical_key?: string
          source_provider?: string
          source_job_id?: string | null
          title?: string
          title_normalized?: string
          company?: string
          company_normalized?: string
          location_text?: string | null
          location_normalized?: string | null
          work_mode?: 'remote' | 'hybrid' | 'onsite' | 'unknown'
          employment_type?: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | null
          salary_text?: string | null
          salary_min?: number | null
          salary_max?: number | null
          salary_currency?: string | null
          description?: string | null
          apply_url?: string | null
          source_url?: string | null
          posted_at_text?: string | null
          freshness_days?: number | null
          source_identifiers?: Json
          first_seen_at?: string
          last_seen_at?: string
          last_raw_fetch_id?: string | null
          times_seen?: number
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
          file_type: 'pdf' | 'docx' | 'txt'
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
          file_type: 'pdf' | 'docx' | 'txt'
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
          job_url: string | null
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
          company_address: string | null
          company_contact_person: string | null
          cv_edits: Json
          optimized_pdf_path: string | null
          optimized_cv_text: string | null
          email_subject: string | null
          email_body: string | null
          selected_template: string
          status: 'applied' | 'interview' | 'rejected' | 'accepted' | 'follow_up'
          cover_letter_language: string
          fit_assessment: Json | null
          generation_completed: boolean
          follow_up_email: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          job_title?: string | null
          company?: string | null
          job_description: string
          job_url?: string | null
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
          company_address?: string | null
          company_contact_person?: string | null
          cv_edits?: Json
          optimized_pdf_path?: string | null
          optimized_cv_text?: string | null
          email_subject?: string | null
          email_body?: string | null
          selected_template?: string
          status?: 'applied' | 'interview' | 'rejected' | 'accepted' | 'follow_up'
          cover_letter_language?: string
          fit_assessment?: Json | null
          generation_completed?: boolean
          follow_up_email?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          job_title?: string | null
          company?: string | null
          job_description?: string
          job_url?: string | null
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
          company_address?: string | null
          company_contact_person?: string | null
          cv_edits?: Json
          optimized_pdf_path?: string | null
          optimized_cv_text?: string | null
          email_subject?: string | null
          email_body?: string | null
          selected_template?: string
          status?: 'applied' | 'interview' | 'rejected' | 'accepted' | 'follow_up'
          cover_letter_language?: string
          fit_assessment?: Json | null
          generation_completed?: boolean
          follow_up_email?: Json | null
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
          tier: 'free' | 'starter' | 'plus' | 'max' | 'pro' | 'enterprise'
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
          tier: 'free' | 'starter' | 'plus' | 'max' | 'pro' | 'enterprise'
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
          tier?: 'free' | 'starter' | 'plus' | 'max' | 'pro' | 'enterprise'
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
      anonymous_generations: {
        Row: {
          id: string
          ip_hash: string
          generated_at: string
        }
        Insert: {
          id?: string
          ip_hash: string
          generated_at?: string
        }
        Update: {
          id?: string
          ip_hash?: string
          generated_at?: string
        }
      }
      contact_submissions: {
        Row: {
          id: string
          name: string
          email: string
          subject: string
          message: string
          submitted_at: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          subject: string
          message: string
          submitted_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          subject?: string
          message?: string
          submitted_at?: string
          created_at?: string
        }
      }
      user_credits: {
        Row: {
          id: string
          user_id: string
          monthly_credits: number
          rollover_credits: number
          addon_credits: number
          plan_tier: 'free' | 'starter' | 'plus' | 'max' | 'pro'
          last_reset_date: string | null
          next_reset_date: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          monthly_credits?: number
          rollover_credits?: number
          addon_credits?: number
          plan_tier?: 'free' | 'starter' | 'plus' | 'max' | 'pro'
          last_reset_date?: string | null
          next_reset_date?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          monthly_credits?: number
          rollover_credits?: number
          addon_credits?: number
          plan_tier?: 'free' | 'starter' | 'plus' | 'max' | 'pro'
          last_reset_date?: string | null
          next_reset_date?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      credit_transactions: {
        Row: {
          id: string
          user_id: string
          amount: number
          transaction_type: string
          session_id: string | null
          description: string | null
          metadata: Json
          balance_before: number
          balance_after: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          transaction_type: string
          session_id?: string | null
          description?: string | null
          metadata?: Json
          balance_before: number
          balance_after: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          transaction_type?: string
          session_id?: string | null
          description?: string | null
          metadata?: Json
          balance_before?: number
          balance_after?: number
          created_at?: string
        }
      }
      subscription_plans: {
        Row: {
          id: string
          tier: 'free' | 'starter' | 'plus' | 'max' | 'pro'
          name: string
          description: string | null
          price_monthly: number
          credits_monthly: number
          rollover_months: number
          max_rollover_credits: number
          addon_enabled: boolean
          stripe_product_id: string | null
          stripe_price_id_monthly: string | null
          active: boolean
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tier: 'free' | 'starter' | 'plus' | 'max' | 'pro'
          name: string
          description?: string | null
          price_monthly?: number
          credits_monthly?: number
          rollover_months?: number
          max_rollover_credits?: number
          addon_enabled?: boolean
          stripe_product_id?: string | null
          stripe_price_id_monthly?: string | null
          active?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tier?: 'free' | 'starter' | 'plus' | 'max' | 'pro'
          name?: string
          description?: string | null
          price_monthly?: number
          credits_monthly?: number
          rollover_months?: number
          max_rollover_credits?: number
          addon_enabled?: boolean
          stripe_product_id?: string | null
          stripe_price_id_monthly?: string | null
          active?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      addon_credit_packs: {
        Row: {
          id: string
          name: string
          credits: number
          price: number
          discount_percent: number
          stripe_product_id: string | null
          stripe_price_id: string | null
          active: boolean
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          credits: number
          price: number
          discount_percent?: number
          stripe_product_id?: string | null
          stripe_price_id?: string | null
          active?: boolean
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          credits?: number
          price?: number
          discount_percent?: number
          stripe_product_id?: string | null
          stripe_price_id?: string | null
          active?: boolean
          display_order?: number
          created_at?: string
        }
      }
      message_feedback: {
        Row: {
          id: string
          user_id: string
          session_id: string | null
          message_id: string
          feedback_type: 'positive' | 'negative'
          feedback_text: string | null
          message_content: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id?: string | null
          message_id: string
          feedback_type: 'positive' | 'negative'
          feedback_text?: string | null
          message_content?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string | null
          message_id?: string
          feedback_type?: 'positive' | 'negative'
          feedback_text?: string | null
          message_content?: string | null
          created_at?: string
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
export type JobFeedSettings = Tables<'job_feed_settings'>
export type JobFeedRun = Tables<'job_feed_runs'>
export type JobFeedRawFetch = Tables<'job_feed_raw_fetches'>
export type JobFeedCanonicalJob = Tables<'job_feed_canonical_jobs'>
export type Document = Tables<'documents'>
export type ProfilePhoto = Tables<'profile_photos'>
export type ApplicationSession = Tables<'application_sessions'>
export type ChatMessage = Tables<'chat_messages'>
export type Subscription = Tables<'subscriptions'>
export type ConnectedAccount = Tables<'connected_accounts'>
export type AnonymousGeneration = Tables<'anonymous_generations'>
export type ContactSubmission = Tables<'contact_submissions'>
export type UserCreditsRow = Tables<'user_credits'>
export type CreditTransaction = Tables<'credit_transactions'>
export type SubscriptionPlan = Tables<'subscription_plans'>
export type AddonCreditPack = Tables<'addon_credit_packs'>
export type MessageFeedback = Tables<'message_feedback'>
