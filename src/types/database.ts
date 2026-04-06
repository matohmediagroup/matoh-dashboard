export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          role: 'owner' | 'manager' | 'editor' | 'videographer' | 'researcher'
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          full_name: string
          role: 'owner' | 'manager' | 'editor' | 'videographer' | 'researcher'
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          role?: 'owner' | 'manager' | 'editor' | 'videographer' | 'researcher'
          avatar_url?: string | null
          created_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          name: string
          logo_url: string | null
          status: 'active' | 'inactive'
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          monthly_retainer: number
          contract_url: string | null
          contract_start: string | null
          contract_end: string | null
          contract_auto_renewal: string | null
          notes: string | null
          color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          logo_url?: string | null
          status?: 'active' | 'inactive'
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          monthly_retainer?: number
          contract_url?: string | null
          contract_start?: string | null
          contract_end?: string | null
          contract_auto_renewal?: string | null
          notes?: string | null
          color?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          logo_url?: string | null
          status?: 'active' | 'inactive'
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          monthly_retainer?: number
          contract_url?: string | null
          contract_start?: string | null
          contract_end?: string | null
          contract_auto_renewal?: string | null
          notes?: string | null
          color?: string
          updated_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          client_id: string
          amount: number
          status: 'paid' | 'unpaid' | 'overdue'
          pdf_url: string | null
          due_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          amount: number
          status?: 'paid' | 'unpaid' | 'overdue'
          pdf_url?: string | null
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          amount?: number
          status?: 'paid' | 'unpaid' | 'overdue'
          pdf_url?: string | null
          due_date?: string | null
          updated_at?: string
        }
      }
      expenses: {
        Row: {
          id: string
          date: string
          category: 'Software' | 'Contractor Pay' | 'Equipment' | 'Travel' | 'Ads' | 'Other'
          description: string | null
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          date?: string
          category: 'Software' | 'Contractor Pay' | 'Equipment' | 'Travel' | 'Ads' | 'Other'
          description?: string | null
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          date?: string
          category?: 'Software' | 'Contractor Pay' | 'Equipment' | 'Travel' | 'Ads' | 'Other'
          description?: string | null
          amount?: number
        }
      }
      shoots: {
        Row: {
          id: string
          client_id: string | null
          shoot_date: string
          shoot_time: string | null
          location: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          shoot_date: string
          shoot_time?: string | null
          location?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          shoot_date?: string
          shoot_time?: string | null
          location?: string | null
          notes?: string | null
          updated_at?: string
        }
      }
      scripts: {
        Row: {
          id: string
          client_id: string | null
          title: string
          body: string | null
          status: 'not_filmed' | 'partially_filmed' | 'fully_filmed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          title: string
          body?: string | null
          status?: 'not_filmed' | 'partially_filmed' | 'fully_filmed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          title?: string
          body?: string | null
          status?: 'not_filmed' | 'partially_filmed' | 'fully_filmed'
          updated_at?: string
        }
      }
      script_shots: {
        Row: {
          id: string
          script_id: string
          shot_title: string
          filmed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          script_id: string
          shot_title: string
          filmed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          script_id?: string
          shot_title?: string
          filmed?: boolean
        }
      }
      content_items: {
        Row: {
          id: string
          title: string
          client_id: string | null
          filming_status: 'not_filmed' | 'filmed'
          edit_status: 'unassigned' | 'in_progress' | 'revisions' | 'done'
          assigned_editor_id: string | null
          posted_date: string | null
          approval_status: 'pending' | 'approved' | 'rejected'
          caption: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          client_id?: string | null
          filming_status?: 'not_filmed' | 'filmed'
          edit_status?: 'unassigned' | 'in_progress' | 'revisions' | 'done'
          assigned_editor_id?: string | null
          posted_date?: string | null
          approval_status?: 'pending' | 'approved' | 'rejected'
          caption?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          client_id?: string | null
          filming_status?: 'not_filmed' | 'filmed'
          edit_status?: 'unassigned' | 'in_progress' | 'revisions' | 'done'
          assigned_editor_id?: string | null
          posted_date?: string | null
          approval_status?: 'pending' | 'approved' | 'rejected'
          caption?: string | null
          updated_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          title: string
          assigned_to: string
          assigned_by: string | null
          due_date: string | null
          status: 'todo' | 'in_progress' | 'done'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          assigned_to: string
          assigned_by?: string | null
          due_date?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          assigned_to?: string
          assigned_by?: string | null
          due_date?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          notes?: string | null
          updated_at?: string
        }
      }
      calendar_events: {
        Row: {
          id: string
          title: string
          event_type: 'meeting' | 'call'
          client_id: string | null
          event_date: string
          event_time: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          event_type?: 'meeting' | 'call'
          client_id?: string | null
          event_date: string
          event_time?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          event_type?: 'meeting' | 'call'
          client_id?: string | null
          event_date?: string
          event_time?: string | null
          notes?: string | null
          updated_at?: string
        }
      }
      activity_log: {
        Row: {
          id: string
          user_id: string | null
          action_type: string
          entity_type: string | null
          entity_id: string | null
          description: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action_type: string
          entity_type?: string | null
          entity_id?: string | null
          description: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          action_type?: string
          entity_type?: string | null
          entity_id?: string | null
          description?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      get_my_role: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: Record<string, never>
  }
}

// Convenience row types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type Expense = Database['public']['Tables']['expenses']['Row']
export type Shoot = Database['public']['Tables']['shoots']['Row']
export type Script = Database['public']['Tables']['scripts']['Row']
export type ScriptShot = Database['public']['Tables']['script_shots']['Row']
export type ContentItem = Database['public']['Tables']['content_items']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type CalendarEvent = Database['public']['Tables']['calendar_events']['Row']
export type ActivityLog = Database['public']['Tables']['activity_log']['Row']

export type Role = Profile['role']
