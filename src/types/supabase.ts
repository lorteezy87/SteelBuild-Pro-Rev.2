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
      account_deletions: {
        Row: {
          created_at: string
          deleted_by: string | null
          id: string
          note: string | null
          org_id: string
          org_name: string | null
          projects_deleted: number
        }
        Insert: {
          created_at?: string
          deleted_by?: string | null
          id?: string
          note?: string | null
          org_id: string
          org_name?: string | null
          projects_deleted?: number
        }
        Update: {
          created_at?: string
          deleted_by?: string | null
          id?: string
          note?: string | null
          org_id?: string
          org_name?: string | null
          projects_deleted?: number
        }
        Relationships: []
      }
      action_items: {
        Row: {
          action_date: string | null
          action_number: string | null
          archived_at: string | null
          assigned_to: string | null
          assigned_user_id: string | null
          category: string | null
          completed_at: string | null
          completed_by: string | null
          constraint_number: string | null
          constraint_type: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          follow_up_date: string | null
          id: string
          impact_date: string | null
          is_deleted: boolean
          meeting_id: string | null
          meeting_reference: string | null
          metadata: Json | null
          priority: string
          project_area: string | null
          project_id: string
          project_name: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          status: string
          title: string | null
          updated_at: string | null
          waiting_on: string | null
          work_package_id: string | null
          workstream: string | null
        }
        Insert: {
          action_date?: string | null
          action_number?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          assigned_user_id?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          constraint_number?: string | null
          constraint_type?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          follow_up_date?: string | null
          id?: string
          impact_date?: string | null
          is_deleted?: boolean
          meeting_id?: string | null
          meeting_reference?: string | null
          metadata?: Json | null
          priority?: string
          project_area?: string | null
          project_id: string
          project_name?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
          waiting_on?: string | null
          work_package_id?: string | null
          workstream?: string | null
        }
        Update: {
          action_date?: string | null
          action_number?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          assigned_user_id?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          constraint_number?: string | null
          constraint_type?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          follow_up_date?: string | null
          id?: string
          impact_date?: string | null
          is_deleted?: boolean
          meeting_id?: string | null
          meeting_reference?: string | null
          metadata?: Json | null
          priority?: string
          project_area?: string | null
          project_id?: string
          project_name?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
          waiting_on?: string | null
          work_package_id?: string | null
          workstream?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_items_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          action: string | null
          created_at: string | null
          description: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          performed_by: string | null
          performed_by_user_id: string | null
          project_id: string
          project_name: string | null
          timestamp: string | null
          updated_at: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          performed_by_user_id?: string | null
          project_id: string
          project_name?: string | null
          timestamp?: string | null
          updated_at?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          performed_by_user_id?: string | null
          project_id?: string
          project_name?: string | null
          timestamp?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audit_log: {
        Row: {
          created_at: string
          final_answer: string | null
          id: string
          project_id: string
          tool_calls: Json | null
          user_id: string | null
          user_messages: Json
        }
        Insert: {
          created_at?: string
          final_answer?: string | null
          id?: string
          project_id: string
          tool_calls?: Json | null
          user_id?: string | null
          user_messages: Json
        }
        Update: {
          created_at?: string
          final_answer?: string | null
          id?: string
          project_id?: string
          tool_calls?: Json | null
          user_id?: string | null
          user_messages?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_type: string | null
          created_at: string | null
          description: string | null
          dismissed_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_dismissed: boolean
          is_read: boolean
          message: string | null
          metadata: Json | null
          metric_snapshot: string | null
          project_id: string
          project_name: string | null
          record_id: string | null
          record_type: string | null
          related_entity: string | null
          related_record_id: string | null
          severity: string
          status: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          alert_type?: string | null
          created_at?: string | null
          description?: string | null
          dismissed_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          metric_snapshot?: string | null
          project_id: string
          project_name?: string | null
          record_id?: string | null
          record_type?: string | null
          related_entity?: string | null
          related_record_id?: string | null
          severity?: string
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          alert_type?: string | null
          created_at?: string | null
          description?: string | null
          dismissed_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          metric_snapshot?: string | null
          project_id?: string
          project_name?: string | null
          record_id?: string | null
          record_type?: string | null
          related_entity?: string | null
          related_record_id?: string | null
          severity?: string
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      backcharge_events: {
        Row: {
          actor: string | null
          backcharge_id: string
          created_at: string
          detail: string | null
          event_type: string
          from_status: string | null
          id: string
          project_id: string
          to_status: string | null
        }
        Insert: {
          actor?: string | null
          backcharge_id: string
          created_at?: string
          detail?: string | null
          event_type: string
          from_status?: string | null
          id?: string
          project_id: string
          to_status?: string | null
        }
        Update: {
          actor?: string | null
          backcharge_id?: string
          created_at?: string
          detail?: string | null
          event_type?: string
          from_status?: string | null
          id?: string
          project_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backcharge_events_backcharge_id_fkey"
            columns: ["backcharge_id"]
            isOneToOne: false
            referencedRelation: "backcharges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backcharge_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      backcharge_tm_tickets: {
        Row: {
          amount: number
          attachments: Json
          backcharge_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          equipment_cost: number
          id: string
          is_deleted: boolean
          labor_hours: number
          labor_rate: number
          markup_percent: number
          material_cost: number
          project_id: string
          signed_by: string | null
          sort_order: number | null
          ticket_date: string | null
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          attachments?: Json
          backcharge_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          equipment_cost?: number
          id?: string
          is_deleted?: boolean
          labor_hours?: number
          labor_rate?: number
          markup_percent?: number
          material_cost?: number
          project_id: string
          signed_by?: string | null
          sort_order?: number | null
          ticket_date?: string | null
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachments?: Json
          backcharge_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          equipment_cost?: number
          id?: string
          is_deleted?: boolean
          labor_hours?: number
          labor_rate?: number
          markup_percent?: number
          material_cost?: number
          project_id?: string
          signed_by?: string | null
          sort_order?: number | null
          ticket_date?: string | null
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backcharge_tm_tickets_backcharge_id_fkey"
            columns: ["backcharge_id"]
            isOneToOne: false
            referencedRelation: "backcharges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backcharge_tm_tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      backcharges: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          attachments: Json
          backcharge_number: string | null
          collected_amount: number | null
          collected_at: string | null
          cost_code_id: string | null
          created_at: string
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          id: string
          incident_date: string | null
          is_deleted: boolean
          linked_co_id: string | null
          metadata: Json
          notes: string | null
          notice_date: string | null
          project_id: string
          reason_code: string | null
          responsible_party: string | null
          responsible_party_type: string | null
          source_rfi_id: string | null
          status: string
          ticket_total: number
          title: string
          updated_at: string
          void_reason: string | null
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attachments?: Json
          backcharge_number?: string | null
          collected_amount?: number | null
          collected_at?: string | null
          cost_code_id?: string | null
          created_at?: string
          created_by?: string | null
          decision_notes?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          incident_date?: string | null
          is_deleted?: boolean
          linked_co_id?: string | null
          metadata?: Json
          notes?: string | null
          notice_date?: string | null
          project_id: string
          reason_code?: string | null
          responsible_party?: string | null
          responsible_party_type?: string | null
          source_rfi_id?: string | null
          status?: string
          ticket_total?: number
          title: string
          updated_at?: string
          void_reason?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attachments?: Json
          backcharge_number?: string | null
          collected_amount?: number | null
          collected_at?: string | null
          cost_code_id?: string | null
          created_at?: string
          created_by?: string | null
          decision_notes?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          incident_date?: string | null
          is_deleted?: boolean
          linked_co_id?: string | null
          metadata?: Json
          notes?: string | null
          notice_date?: string | null
          project_id?: string
          reason_code?: string | null
          responsible_party?: string | null
          responsible_party_type?: string | null
          source_rfi_id?: string | null
          status?: string
          ticket_total?: number
          title?: string
          updated_at?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backcharges_cost_code_id_fkey"
            columns: ["cost_code_id"]
            isOneToOne: false
            referencedRelation: "cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backcharges_linked_co_id_fkey"
            columns: ["linked_co_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backcharges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backcharges_source_rfi_id_fkey"
            columns: ["source_rfi_id"]
            isOneToOne: false
            referencedRelation: "rfis"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_config: {
        Row: {
          livemode: boolean | null
          scope: string
          stripe_price_business: string | null
          stripe_price_pro: string | null
          stripe_webhook_endpoint_id: string | null
          stripe_webhook_secret: string | null
          updated_at: string
        }
        Insert: {
          livemode?: boolean | null
          scope?: string
          stripe_price_business?: string | null
          stripe_price_pro?: string | null
          stripe_webhook_endpoint_id?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string
        }
        Update: {
          livemode?: boolean | null
          scope?: string
          stripe_price_business?: string | null
          stripe_price_pro?: string | null
          stripe_webhook_endpoint_id?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          stripe_event_id: string
          type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          stripe_event_id: string
          type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          stripe_event_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_hour_items: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          field_hours_actual: number | null
          field_hours_budget: number | null
          id: string
          is_deleted: boolean
          is_specialty: boolean | null
          metadata: Json | null
          notes: string | null
          project_id: string
          scope_item: string
          shop_hours_actual: number | null
          shop_hours_budget: number | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          field_hours_actual?: number | null
          field_hours_budget?: number | null
          id?: string
          is_deleted?: boolean
          is_specialty?: boolean | null
          metadata?: Json | null
          notes?: string | null
          project_id: string
          scope_item: string
          shop_hours_actual?: number | null
          shop_hours_budget?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          field_hours_actual?: number | null
          field_hours_budget?: number | null
          id?: string
          is_deleted?: boolean
          is_specialty?: boolean | null
          metadata?: Json | null
          notes?: string | null
          project_id?: string
          scope_item?: string
          shop_hours_actual?: number | null
          shop_hours_budget?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_hour_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_date: string | null
          attachments: string | null
          change_request_id: string | null
          co_amount: number | null
          co_number: string | null
          cost_code_id: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          margin_percent: number | null
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          reason_code: string | null
          schedule_impact_days: number | null
          source_rfi_id: string | null
          sov_applied_at: string | null
          sov_line_item_id: string | null
          sov_line_number: number | null
          sov_mode: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_date?: string | null
          attachments?: string | null
          change_request_id?: string | null
          co_amount?: number | null
          co_number?: string | null
          cost_code_id?: string | null
          created_at?: string | null
          created_by?: string | null
          decision_notes?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          margin_percent?: number | null
          metadata?: Json | null
          notes?: string | null
          project_id: string
          project_name?: string | null
          reason_code?: string | null
          schedule_impact_days?: number | null
          source_rfi_id?: string | null
          sov_applied_at?: string | null
          sov_line_item_id?: string | null
          sov_line_number?: number | null
          sov_mode?: string | null
          status?: string
          submitted_by?: string | null
          submitted_date?: string | null
          title?: string | null
          updated_at?: string | null
          void_reason?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_date?: string | null
          attachments?: string | null
          change_request_id?: string | null
          co_amount?: number | null
          co_number?: string | null
          cost_code_id?: string | null
          created_at?: string | null
          created_by?: string | null
          decision_notes?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          margin_percent?: number | null
          metadata?: Json | null
          notes?: string | null
          project_id?: string
          project_name?: string | null
          reason_code?: string | null
          schedule_impact_days?: number | null
          source_rfi_id?: string | null
          sov_applied_at?: string | null
          sov_line_item_id?: string | null
          sov_line_number?: number | null
          sov_mode?: string | null
          status?: string
          submitted_by?: string | null
          submitted_date?: string | null
          title?: string | null
          updated_at?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          affected_areas: string | null
          change_order_id: string | null
          cr_number: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          estimated_cost_impact: number | null
          estimated_schedule_impact_days: number | null
          id: string
          is_deleted: boolean
          metadata: Json | null
          priority: string
          project_id: string
          project_name: string | null
          reason: string | null
          request_date: string | null
          requested_by: string | null
          scope_impact: string | null
          status: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          affected_areas?: string | null
          change_order_id?: string | null
          cr_number?: string | null
          created_at?: string | null
          created_by?: string | null
          decision_notes?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_cost_impact?: number | null
          estimated_schedule_impact_days?: number | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          priority?: string
          project_id: string
          project_name?: string | null
          reason?: string | null
          request_date?: string | null
          requested_by?: string | null
          scope_impact?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_areas?: string | null
          change_order_id?: string | null
          cr_number?: string | null
          created_at?: string | null
          created_by?: string | null
          decision_notes?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_cost_impact?: number | null
          estimated_schedule_impact_days?: number | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          priority?: string
          project_id?: string
          project_name?: string | null
          reason?: string | null
          request_date?: string | null
          requested_by?: string | null
          scope_impact?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_events: {
        Row: {
          app_version: string | null
          id: string
          kind: string
          message: string
          metadata: Json
          occurred_at: string
          org_id: string | null
          project_id: string | null
          route: string | null
          source: string | null
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          id?: string
          kind: string
          message: string
          metadata?: Json
          occurred_at?: string
          org_id?: string | null
          project_id?: string | null
          route?: string | null
          source?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          id?: string
          kind?: string
          message?: string
          metadata?: Json
          occurred_at?: string
          org_id?: string | null
          project_id?: string | null
          route?: string | null
          source?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          entity_id: string
          entity_type: string
          id: string
          is_deleted: boolean | null
          mentions: string[] | null
          metadata: Json | null
          project_id: string
          status: string | null
          status_changed_at: string | null
          status_changed_by: string | null
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_deleted?: boolean | null
          mentions?: string[] | null
          metadata?: Json | null
          project_id: string
          status?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_deleted?: boolean | null
          mentions?: string[] | null
          metadata?: Json | null
          project_id?: string
          status?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          contact_type: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          is_deleted: boolean
          last_name: string | null
          metadata: Json | null
          notes: string | null
          phone: string | null
          project_id: string
          project_name: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          contact_type?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_deleted?: boolean
          last_name?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          project_id: string
          project_name?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          contact_type?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_deleted?: boolean
          last_name?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          project_id?: string
          project_name?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_codes: {
        Row: {
          actual: number | null
          actual_cost: number | null
          budget: number | null
          budget_amount: number | null
          category: string | null
          code: string | null
          committed: number | null
          committed_cost: number | null
          cost_code_number: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          expense_actual: number
          forecast_to_complete: number | null
          id: string
          is_deleted: boolean
          metadata: Json | null
          notes: string | null
          phase: string | null
          project_id: string
          project_name: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          actual?: number | null
          actual_cost?: number | null
          budget?: number | null
          budget_amount?: number | null
          category?: string | null
          code?: string | null
          committed?: number | null
          committed_cost?: number | null
          cost_code_number?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expense_actual?: number
          forecast_to_complete?: number | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          notes?: string | null
          phase?: string | null
          project_id: string
          project_name?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          actual?: number | null
          actual_cost?: number | null
          budget?: number | null
          budget_amount?: number | null
          category?: string | null
          code?: string | null
          committed?: number | null
          committed_cost?: number | null
          cost_code_number?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expense_actual?: number
          forecast_to_complete?: number | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          notes?: string | null
          phase?: string | null
          project_id?: string
          project_name?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_codes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          activities: string | null
          client_op_id: string | null
          created_at: string | null
          created_by: string | null
          crew_name: string | null
          date: string | null
          delay_hours: number | null
          delays: string | null
          deleted_at: string | null
          delivery_ids: string[] | null
          equipment_used: string | null
          headcount: number | null
          hours_worked: number | null
          id: string
          is_deleted: boolean
          materials_received: string | null
          metadata: Json | null
          phase: string | null
          photos: Json | null
          project_id: string
          project_name: string | null
          related_action_item_ids: Json | null
          related_rfi_ids: Json | null
          safety_incidents: number | null
          safety_notes: string | null
          schedule_task_ids: string[] | null
          status: string | null
          superintendent: string | null
          temperature: string | null
          toolbox_talk_completed: boolean | null
          updated_at: string | null
          weather_description: string | null
          wind_speed: string | null
          wp_progress: Json | null
        }
        Insert: {
          activities?: string | null
          client_op_id?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_name?: string | null
          date?: string | null
          delay_hours?: number | null
          delays?: string | null
          deleted_at?: string | null
          delivery_ids?: string[] | null
          equipment_used?: string | null
          headcount?: number | null
          hours_worked?: number | null
          id?: string
          is_deleted?: boolean
          materials_received?: string | null
          metadata?: Json | null
          phase?: string | null
          photos?: Json | null
          project_id: string
          project_name?: string | null
          related_action_item_ids?: Json | null
          related_rfi_ids?: Json | null
          safety_incidents?: number | null
          safety_notes?: string | null
          schedule_task_ids?: string[] | null
          status?: string | null
          superintendent?: string | null
          temperature?: string | null
          toolbox_talk_completed?: boolean | null
          updated_at?: string | null
          weather_description?: string | null
          wind_speed?: string | null
          wp_progress?: Json | null
        }
        Update: {
          activities?: string | null
          client_op_id?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_name?: string | null
          date?: string | null
          delay_hours?: number | null
          delays?: string | null
          deleted_at?: string | null
          delivery_ids?: string[] | null
          equipment_used?: string | null
          headcount?: number | null
          hours_worked?: number | null
          id?: string
          is_deleted?: boolean
          materials_received?: string | null
          metadata?: Json | null
          phase?: string | null
          photos?: Json | null
          project_id?: string
          project_name?: string | null
          related_action_item_ids?: Json | null
          related_rfi_ids?: Json | null
          safety_incidents?: number | null
          safety_notes?: string | null
          schedule_task_ids?: string[] | null
          status?: string | null
          superintendent?: string | null
          temperature?: string | null
          toolbox_talk_completed?: boolean | null
          updated_at?: string | null
          weather_description?: string | null
          wind_speed?: string | null
          wp_progress?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      data_erasure_log: {
        Row: {
          created_at: string
          id: string
          kind: string
          org_id: string | null
          org_name: string | null
          project_id: string | null
          project_name: string | null
          project_number: string | null
          reason: string | null
          record_id: string | null
          record_label: string | null
          requested_by: string | null
          requested_by_email: string | null
          row_counts: Json
          storage_prefix: string | null
          subject_email: string | null
          subject_user_id: string | null
          table_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          org_id?: string | null
          org_name?: string | null
          project_id?: string | null
          project_name?: string | null
          project_number?: string | null
          reason?: string | null
          record_id?: string | null
          record_label?: string | null
          requested_by?: string | null
          requested_by_email?: string | null
          row_counts?: Json
          storage_prefix?: string | null
          subject_email?: string | null
          subject_user_id?: string | null
          table_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          org_id?: string | null
          org_name?: string | null
          project_id?: string | null
          project_name?: string | null
          project_number?: string | null
          reason?: string | null
          record_id?: string | null
          record_label?: string | null
          requested_by?: string | null
          requested_by_email?: string | null
          row_counts?: Json
          storage_prefix?: string | null
          subject_email?: string | null
          subject_user_id?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      default_cost_codes: {
        Row: {
          category: string
          cost_code_number: string
          created_at: string | null
          default_budget_amount: number | null
          description: string
          id: string
          is_active: boolean
          metadata: Json | null
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          category: string
          cost_code_number: string
          created_at?: string | null
          default_budget_amount?: number | null
          description: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          category?: string
          cost_code_number?: string
          created_at?: string | null
          default_budget_amount?: number | null
          description?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          actual_date: string | null
          area: string | null
          capacity_lbs: number | null
          carrier: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delivery_number: string | null
          delivery_title: string | null
          delivery_type: string | null
          description: string | null
          expected_ship_date: string | null
          id: string
          impacts_activity_ids: string[] | null
          inspection_required: boolean | null
          is_deleted: boolean
          is_long_lead: boolean | null
          lead_time_weeks: number | null
          load_category: string | null
          load_number: string | null
          metadata: Json | null
          notes: string | null
          order_placed_date: string | null
          pieces: number | null
          pieces_advanced_count: number
          po_number: string | null
          priority: string
          procurement_category: string | null
          project_id: string
          project_name: string | null
          received_at: string | null
          received_by: string | null
          received_notes: string | null
          receiving_location: string | null
          required_date: string | null
          scheduled_date: string | null
          sequence_number: string | null
          shipping_ticket_name: string | null
          shipping_ticket_path: string | null
          shipping_ticket_url: string | null
          special_instructions: string | null
          status: string
          tracking_number: string | null
          updated_at: string | null
          vendor: string | null
          weight_tons: number | null
          work_package_id: string | null
        }
        Insert: {
          actual_date?: string | null
          area?: string | null
          capacity_lbs?: number | null
          carrier?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_number?: string | null
          delivery_title?: string | null
          delivery_type?: string | null
          description?: string | null
          expected_ship_date?: string | null
          id?: string
          impacts_activity_ids?: string[] | null
          inspection_required?: boolean | null
          is_deleted?: boolean
          is_long_lead?: boolean | null
          lead_time_weeks?: number | null
          load_category?: string | null
          load_number?: string | null
          metadata?: Json | null
          notes?: string | null
          order_placed_date?: string | null
          pieces?: number | null
          pieces_advanced_count?: number
          po_number?: string | null
          priority?: string
          procurement_category?: string | null
          project_id: string
          project_name?: string | null
          received_at?: string | null
          received_by?: string | null
          received_notes?: string | null
          receiving_location?: string | null
          required_date?: string | null
          scheduled_date?: string | null
          sequence_number?: string | null
          shipping_ticket_name?: string | null
          shipping_ticket_path?: string | null
          shipping_ticket_url?: string | null
          special_instructions?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string | null
          vendor?: string | null
          weight_tons?: number | null
          work_package_id?: string | null
        }
        Update: {
          actual_date?: string | null
          area?: string | null
          capacity_lbs?: number | null
          carrier?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_number?: string | null
          delivery_title?: string | null
          delivery_type?: string | null
          description?: string | null
          expected_ship_date?: string | null
          id?: string
          impacts_activity_ids?: string[] | null
          inspection_required?: boolean | null
          is_deleted?: boolean
          is_long_lead?: boolean | null
          lead_time_weeks?: number | null
          load_category?: string | null
          load_number?: string | null
          metadata?: Json | null
          notes?: string | null
          order_placed_date?: string | null
          pieces?: number | null
          pieces_advanced_count?: number
          po_number?: string | null
          priority?: string
          procurement_category?: string | null
          project_id?: string
          project_name?: string | null
          received_at?: string | null
          received_by?: string | null
          received_notes?: string | null
          receiving_location?: string | null
          required_date?: string | null
          scheduled_date?: string | null
          sequence_number?: string | null
          shipping_ticket_name?: string | null
          shipping_ticket_path?: string | null
          shipping_ticket_url?: string | null
          special_instructions?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string | null
          vendor?: string | null
          weight_tons?: number | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          assembly_mark: string | null
          created_at: string | null
          delivery_id: string | null
          finish: string | null
          grade: string | null
          id: string
          length_inches: number | null
          length_text: string | null
          line_no: number | null
          metadata: Json | null
          notes: string | null
          piece_id: string | null
          profile: string | null
          qty: number
          received_at: string | null
          received_qty: number | null
          sequence: string | null
          updated_at: string | null
          weight_lbs: number | null
        }
        Insert: {
          assembly_mark?: string | null
          created_at?: string | null
          delivery_id?: string | null
          finish?: string | null
          grade?: string | null
          id?: string
          length_inches?: number | null
          length_text?: string | null
          line_no?: number | null
          metadata?: Json | null
          notes?: string | null
          piece_id?: string | null
          profile?: string | null
          qty?: number
          received_at?: string | null
          received_qty?: number | null
          sequence?: string | null
          updated_at?: string | null
          weight_lbs?: number | null
        }
        Update: {
          assembly_mark?: string | null
          created_at?: string | null
          delivery_id?: string | null
          finish?: string | null
          grade?: string | null
          id?: string
          length_inches?: number | null
          length_text?: string | null
          line_no?: number | null
          metadata?: Json | null
          notes?: string | null
          piece_id?: string | null
          profile?: string | null
          qty?: number
          received_at?: string | null
          received_qty?: number | null
          sequence?: string | null
          updated_at?: string | null
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          source: string
          status: string
          tonnage: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          source?: string
          status?: string
          tonnage?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          source?: string
          status?: string
          tonnage?: string | null
        }
        Relationships: []
      }
      document_folders: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_by_id: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          name: string
          parent_folder_id: string | null
          project_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          created_by_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          parent_folder_id?: string | null
          project_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          created_by_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          parent_folder_id?: string | null
          project_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      document_import_queue: {
        Row: {
          created_at: string
          created_document_id: string | null
          deleted_at: string | null
          external_file_id: string
          external_file_url: string | null
          external_last_modified: string | null
          file_name: string
          file_size: number | null
          id: string
          import_status: string
          is_deleted: boolean
          linked_folder_id: string | null
          metadata: Json | null
          mime_type: string | null
          project_id: string
          provider: string
          reviewed_at: string | null
          reviewed_by: string | null
          target_folder_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_document_id?: string | null
          deleted_at?: string | null
          external_file_id: string
          external_file_url?: string | null
          external_last_modified?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          import_status?: string
          is_deleted?: boolean
          linked_folder_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          project_id: string
          provider: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          target_folder_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_document_id?: string | null
          deleted_at?: string | null
          external_file_id?: string
          external_file_url?: string | null
          external_last_modified?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          import_status?: string
          is_deleted?: boolean
          linked_folder_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          project_id?: string
          provider?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          target_folder_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_import_queue_created_document_id_fkey"
            columns: ["created_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_import_queue_linked_folder_id_fkey"
            columns: ["linked_folder_id"]
            isOneToOne: false
            referencedRelation: "linked_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_import_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_import_queue_target_folder_id_fkey"
            columns: ["target_folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string | null
          change_order_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delivery_id: string | null
          description: string | null
          discipline: string | null
          display_name: string | null
          document_number: string | null
          document_type: string | null
          drawing_number: string | null
          due_date: string | null
          external_drive_id: string | null
          external_file_id: string | null
          external_file_url: string | null
          external_last_modified: string | null
          external_provider: string | null
          external_site_id: string | null
          external_synced_at: string | null
          file_name: string | null
          file_size: number | null
          file_size_kb: number | null
          file_type: string | null
          file_url: string | null
          folder_id: string | null
          id: string
          import_source: string | null
          is_current: boolean | null
          is_deleted: boolean
          is_submittal: boolean | null
          linked_folder_id: string | null
          linked_wp_id: string | null
          metadata: Json | null
          mime_type: string | null
          notes: string | null
          project_id: string
          project_name: string | null
          review_lead_time: number | null
          revision: string | null
          revision_date: string | null
          revision_note: string | null
          revision_number: string | null
          rfi_id: string | null
          sheet_number: string | null
          status: string | null
          submittal_id: string | null
          superseded_by_id: string | null
          supersedes_id: string | null
          tags: string | null
          title: string | null
          updated_at: string | null
          uploaded_by: string | null
          uploaded_by_id: string | null
          uploaded_date: string | null
          version: string | null
          work_package_id: string | null
        }
        Insert: {
          category?: string | null
          change_order_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_id?: string | null
          description?: string | null
          discipline?: string | null
          display_name?: string | null
          document_number?: string | null
          document_type?: string | null
          drawing_number?: string | null
          due_date?: string | null
          external_drive_id?: string | null
          external_file_id?: string | null
          external_file_url?: string | null
          external_last_modified?: string | null
          external_provider?: string | null
          external_site_id?: string | null
          external_synced_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_size_kb?: number | null
          file_type?: string | null
          file_url?: string | null
          folder_id?: string | null
          id?: string
          import_source?: string | null
          is_current?: boolean | null
          is_deleted?: boolean
          is_submittal?: boolean | null
          linked_folder_id?: string | null
          linked_wp_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          notes?: string | null
          project_id: string
          project_name?: string | null
          review_lead_time?: number | null
          revision?: string | null
          revision_date?: string | null
          revision_note?: string | null
          revision_number?: string | null
          rfi_id?: string | null
          sheet_number?: string | null
          status?: string | null
          submittal_id?: string | null
          superseded_by_id?: string | null
          supersedes_id?: string | null
          tags?: string | null
          title?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          uploaded_by_id?: string | null
          uploaded_date?: string | null
          version?: string | null
          work_package_id?: string | null
        }
        Update: {
          category?: string | null
          change_order_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_id?: string | null
          description?: string | null
          discipline?: string | null
          display_name?: string | null
          document_number?: string | null
          document_type?: string | null
          drawing_number?: string | null
          due_date?: string | null
          external_drive_id?: string | null
          external_file_id?: string | null
          external_file_url?: string | null
          external_last_modified?: string | null
          external_provider?: string | null
          external_site_id?: string | null
          external_synced_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_size_kb?: number | null
          file_type?: string | null
          file_url?: string | null
          folder_id?: string | null
          id?: string
          import_source?: string | null
          is_current?: boolean | null
          is_deleted?: boolean
          is_submittal?: boolean | null
          linked_folder_id?: string | null
          linked_wp_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          notes?: string | null
          project_id?: string
          project_name?: string | null
          review_lead_time?: number | null
          revision?: string | null
          revision_date?: string | null
          revision_note?: string | null
          revision_number?: string | null
          rfi_id?: string | null
          sheet_number?: string | null
          status?: string | null
          submittal_id?: string | null
          superseded_by_id?: string | null
          supersedes_id?: string | null
          tags?: string | null
          title?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          uploaded_by_id?: string | null
          uploaded_date?: string | null
          version?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_linked_folder_id_fkey"
            columns: ["linked_folder_id"]
            isOneToOne: false
            referencedRelation: "linked_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_linked_wp_id_fkey"
            columns: ["linked_wp_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          drawing_id: string
          event_type: string
          from_value: string | null
          id: string
          metadata: Json | null
          project_id: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          drawing_id: string
          event_type: string
          from_value?: string | null
          id?: string
          metadata?: Json | null
          project_id: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          drawing_id?: string
          event_type?: string
          from_value?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_analyses: {
        Row: {
          ai_summary: string | null
          analysis_status: string | null
          created_at: string | null
          drawing_stage: string | null
          error_message: string | null
          file_name: string
          file_url: string
          id: string
          imported_set_id: string | null
          issue_date: string | null
          metadata: Json | null
          model: string | null
          project_id: string | null
          raw_ai_response: Json | null
          revision: string | null
          sheet_count: number | null
          storage_path: string | null
          updated_at: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          ai_summary?: string | null
          analysis_status?: string | null
          created_at?: string | null
          drawing_stage?: string | null
          error_message?: string | null
          file_name: string
          file_url: string
          id?: string
          imported_set_id?: string | null
          issue_date?: string | null
          metadata?: Json | null
          model?: string | null
          project_id?: string | null
          raw_ai_response?: Json | null
          revision?: string | null
          sheet_count?: number | null
          storage_path?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          ai_summary?: string | null
          analysis_status?: string | null
          created_at?: string | null
          drawing_stage?: string | null
          error_message?: string | null
          file_name?: string
          file_url?: string
          id?: string
          imported_set_id?: string | null
          issue_date?: string | null
          metadata?: Json | null
          model?: string | null
          project_id?: string | null
          raw_ai_response?: Json | null
          revision?: string | null
          sheet_count?: number | null
          storage_path?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_analyses_imported_set_id_fkey"
            columns: ["imported_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_analyses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_callout_links: {
        Row: {
          coords: Json | null
          created_at: string
          created_by_id: string | null
          detail_number: string | null
          id: string
          link_source: string
          project_id: string
          raw_text: string
          source_drawing_id: string
          target_as_printed: string
          target_drawing_id: string | null
          target_sheet_key: string
          updated_at: string
        }
        Insert: {
          coords?: Json | null
          created_at?: string
          created_by_id?: string | null
          detail_number?: string | null
          id?: string
          link_source?: string
          project_id: string
          raw_text: string
          source_drawing_id: string
          target_as_printed: string
          target_drawing_id?: string | null
          target_sheet_key: string
          updated_at?: string
        }
        Update: {
          coords?: Json | null
          created_at?: string
          created_by_id?: string | null
          detail_number?: string | null
          id?: string
          link_source?: string
          project_id?: string
          raw_text?: string
          source_drawing_id?: string
          target_as_printed?: string
          target_drawing_id?: string | null
          target_sheet_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_callout_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_callout_links_source_drawing_id_fkey"
            columns: ["source_drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_callout_links_source_drawing_id_fkey"
            columns: ["source_drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_callout_links_target_drawing_id_fkey"
            columns: ["target_drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_callout_links_target_drawing_id_fkey"
            columns: ["target_drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_findings: {
        Row: {
          analysis_id: string | null
          bbox_source: string | null
          created_at: string | null
          description: string
          dismissed: boolean | null
          dismissed_at: string | null
          dismissed_by: string | null
          finding_type: string | null
          id: string
          linked_rfi_id: string | null
          page_index: number | null
          recommended_action: string | null
          severity: string | null
          sheet_number: string | null
          updated_at: string | null
          x_max: number | null
          x_min: number | null
          y_max: number | null
          y_min: number | null
        }
        Insert: {
          analysis_id?: string | null
          bbox_source?: string | null
          created_at?: string | null
          description: string
          dismissed?: boolean | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          finding_type?: string | null
          id?: string
          linked_rfi_id?: string | null
          page_index?: number | null
          recommended_action?: string | null
          severity?: string | null
          sheet_number?: string | null
          updated_at?: string | null
          x_max?: number | null
          x_min?: number | null
          y_max?: number | null
          y_min?: number | null
        }
        Update: {
          analysis_id?: string | null
          bbox_source?: string | null
          created_at?: string | null
          description?: string
          dismissed?: boolean | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          finding_type?: string | null
          id?: string
          linked_rfi_id?: string | null
          page_index?: number | null
          recommended_action?: string | null
          severity?: string | null
          sheet_number?: string | null
          updated_at?: string | null
          x_max?: number | null
          x_min?: number | null
          y_max?: number | null
          y_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_findings_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "drawing_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_findings_linked_rfi_id_fkey"
            columns: ["linked_rfi_id"]
            isOneToOne: false
            referencedRelation: "rfis"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_holds: {
        Row: {
          created_at: string
          drawing_id: string
          id: string
          is_active: boolean
          metadata: Json
          placed_at: string
          placed_by_id: string | null
          placed_by_name: string | null
          prior_release_status: string | null
          prior_stage: string | null
          project_id: string
          reason: string
          release_notes: string | null
          released_at: string | null
          released_by_id: string | null
          released_by_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          drawing_id: string
          id?: string
          is_active?: boolean
          metadata?: Json
          placed_at?: string
          placed_by_id?: string | null
          placed_by_name?: string | null
          prior_release_status?: string | null
          prior_stage?: string | null
          project_id: string
          reason: string
          release_notes?: string | null
          released_at?: string | null
          released_by_id?: string | null
          released_by_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          drawing_id?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          placed_at?: string
          placed_by_id?: string | null
          placed_by_name?: string | null
          prior_release_status?: string | null
          prior_stage?: string | null
          project_id?: string
          reason?: string
          release_notes?: string | null
          released_at?: string | null
          released_by_id?: string | null
          released_by_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_holds_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_holds_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_holds_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_impacts: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          drawing_revision_id: string
          due_date: string | null
          id: string
          impact_type: string
          notes: string | null
          priority: string
          project_id: string
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          drawing_revision_id: string
          due_date?: string | null
          id?: string
          impact_type: string
          notes?: string | null
          priority?: string
          project_id: string
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          drawing_revision_id?: string
          due_date?: string | null
          id?: string
          impact_type?: string
          notes?: string | null
          priority?: string
          project_id?: string
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_impacts_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_impacts_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_impacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_links: {
        Row: {
          confidence_score: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          drawing_id: string
          drawing_revision_id: string
          drawing_zone_id: string
          id: string
          is_confirmed: boolean
          link_role: string
          link_source: string
          linked_record_id: string
          linked_record_type: string
          metadata: Json
          project_id: string
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          confidence_score?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          drawing_id: string
          drawing_revision_id: string
          drawing_zone_id: string
          id?: string
          is_confirmed?: boolean
          link_role?: string
          link_source?: string
          linked_record_id: string
          linked_record_type: string
          metadata?: Json
          project_id: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          confidence_score?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          drawing_id?: string
          drawing_revision_id?: string
          drawing_zone_id?: string
          id?: string
          is_confirmed?: boolean
          link_role?: string
          link_source?: string
          linked_record_id?: string
          linked_record_type?: string
          metadata?: Json
          project_id?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_links_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_links_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_links_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_links_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_links_drawing_zone_id_fkey"
            columns: ["drawing_zone_id"]
            isOneToOne: false
            referencedRelation: "drawing_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_markups: {
        Row: {
          author_email: string | null
          author_id: string | null
          author_name: string | null
          color: string | null
          comment: string | null
          created_at: string
          drawing_id: string | null
          drawing_revision_id: string | null
          height: number | null
          id: string
          markup_type: string
          page_number: number
          page_x: number | null
          page_y: number | null
          payload: Json
          project_id: string
          status: string
          updated_at: string
          width: number | null
        }
        Insert: {
          author_email?: string | null
          author_id?: string | null
          author_name?: string | null
          color?: string | null
          comment?: string | null
          created_at?: string
          drawing_id?: string | null
          drawing_revision_id?: string | null
          height?: number | null
          id?: string
          markup_type: string
          page_number?: number
          page_x?: number | null
          page_y?: number | null
          payload?: Json
          project_id: string
          status?: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          author_email?: string | null
          author_id?: string | null
          author_name?: string | null
          color?: string | null
          comment?: string | null
          created_at?: string
          drawing_id?: string | null
          drawing_revision_id?: string | null
          height?: number | null
          id?: string
          markup_type?: string
          page_number?: number
          page_x?: number | null
          page_y?: number | null
          payload?: Json
          project_id?: string
          status?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_markups_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_markups_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_markups_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_markups_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_markups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_reviews: {
        Row: {
          comments: string | null
          created_at: string
          decision: string
          drawing_revision_id: string
          id: string
          project_id: string
          review_role: string
          reviewed_at: string | null
          reviewer_id: string | null
          updated_at: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          decision?: string
          drawing_revision_id: string
          id?: string
          project_id: string
          review_role: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          updated_at?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          decision?: string
          drawing_revision_id?: string
          id?: string
          project_id?: string
          review_role?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_reviews_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_reviews_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_revision_comparisons: {
        Row: {
          ai_summary: string | null
          compare_status: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delta_count: number | null
          deterministic_stats: Json | null
          drawing_id: string | null
          error_message: string | null
          from_analysis_id: string | null
          from_revision_id: string | null
          id: string
          is_deleted: boolean
          metadata: Json | null
          model: string | null
          project_id: string | null
          raw_ai_response: Json | null
          requested_by: string | null
          source: string
          to_analysis_id: string | null
          to_revision_id: string | null
          updated_at: string | null
        }
        Insert: {
          ai_summary?: string | null
          compare_status?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delta_count?: number | null
          deterministic_stats?: Json | null
          drawing_id?: string | null
          error_message?: string | null
          from_analysis_id?: string | null
          from_revision_id?: string | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          model?: string | null
          project_id?: string | null
          raw_ai_response?: Json | null
          requested_by?: string | null
          source?: string
          to_analysis_id?: string | null
          to_revision_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_summary?: string | null
          compare_status?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delta_count?: number | null
          deterministic_stats?: Json | null
          drawing_id?: string | null
          error_message?: string | null
          from_analysis_id?: string | null
          from_revision_id?: string | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          model?: string | null
          project_id?: string | null
          raw_ai_response?: Json | null
          requested_by?: string | null
          source?: string
          to_analysis_id?: string | null
          to_revision_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revision_comparisons_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_revision_comparisons_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_comparisons_from_analysis_id_fkey"
            columns: ["from_analysis_id"]
            isOneToOne: false
            referencedRelation: "drawing_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_comparisons_from_revision_id_fkey"
            columns: ["from_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_revision_comparisons_from_revision_id_fkey"
            columns: ["from_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_comparisons_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_comparisons_to_analysis_id_fkey"
            columns: ["to_analysis_id"]
            isOneToOne: false
            referencedRelation: "drawing_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_comparisons_to_revision_id_fkey"
            columns: ["to_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_revision_comparisons_to_revision_id_fkey"
            columns: ["to_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_revision_deltas: {
        Row: {
          change_category: string | null
          classification_confidence: string | null
          classification_source: string | null
          comparison_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delta_type: string | null
          description: string
          dismissed: boolean | null
          dismissed_at: string | null
          dismissed_by: string | null
          drawing_id: string | null
          id: string
          impact_summary: string | null
          is_deleted: boolean
          likely_owner: string | null
          linked_rfi_id: string | null
          project_id: string | null
          recommended_action: string | null
          severity: string | null
          sheet_number: string | null
          updated_at: string | null
        }
        Insert: {
          change_category?: string | null
          classification_confidence?: string | null
          classification_source?: string | null
          comparison_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delta_type?: string | null
          description: string
          dismissed?: boolean | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          drawing_id?: string | null
          id?: string
          impact_summary?: string | null
          is_deleted?: boolean
          likely_owner?: string | null
          linked_rfi_id?: string | null
          project_id?: string | null
          recommended_action?: string | null
          severity?: string | null
          sheet_number?: string | null
          updated_at?: string | null
        }
        Update: {
          change_category?: string | null
          classification_confidence?: string | null
          classification_source?: string | null
          comparison_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delta_type?: string | null
          description?: string
          dismissed?: boolean | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          drawing_id?: string | null
          id?: string
          impact_summary?: string | null
          is_deleted?: boolean
          likely_owner?: string | null
          linked_rfi_id?: string | null
          project_id?: string | null
          recommended_action?: string | null
          severity?: string | null
          sheet_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revision_deltas_comparison_id_fkey"
            columns: ["comparison_id"]
            isOneToOne: false
            referencedRelation: "drawing_revision_comparisons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_deltas_linked_rfi_id_fkey"
            columns: ["linked_rfi_id"]
            isOneToOne: false
            referencedRelation: "rfis"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_revision_summaries: {
        Row: {
          created_at: string
          deleted_at: string | null
          drawing_set_id: string | null
          generated_at: string
          generated_by: string | null
          high_risk_count: number
          id: string
          impact_level: string
          is_deleted: boolean
          likely_rfi: boolean
          project_id: string
          set_name: string | null
          sheets_changed: number
          summary: Json
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          drawing_set_id?: string | null
          generated_at?: string
          generated_by?: string | null
          high_risk_count?: number
          id?: string
          impact_level?: string
          is_deleted?: boolean
          likely_rfi?: boolean
          project_id: string
          set_name?: string | null
          sheets_changed?: number
          summary?: Json
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          drawing_set_id?: string | null
          generated_at?: string
          generated_by?: string | null
          high_risk_count?: number
          id?: string
          impact_level?: string
          is_deleted?: boolean
          likely_rfi?: boolean
          project_id?: string
          set_name?: string | null
          sheets_changed?: number
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revision_summaries_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_summaries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_revisions: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          drawing_id: string
          file_id: string | null
          file_url: string | null
          id: string
          is_current: boolean
          issued_at: string | null
          pdf_page: number | null
          project_id: string
          received_at: string | null
          release_status: string
          revision_code: string
          revision_name: string | null
          revision_notes: string | null
          revision_reason: string | null
          revision_source: string | null
          sheet_number: string
          sheet_title: string
          supersedes_revision_id: string | null
          updated_at: string
          updated_by: string | null
          version_number: number
          viewer_height: number | null
          viewer_width: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          drawing_id: string
          file_id?: string | null
          file_url?: string | null
          id?: string
          is_current?: boolean
          issued_at?: string | null
          pdf_page?: number | null
          project_id: string
          received_at?: string | null
          release_status?: string
          revision_code: string
          revision_name?: string | null
          revision_notes?: string | null
          revision_reason?: string | null
          revision_source?: string | null
          sheet_number: string
          sheet_title: string
          supersedes_revision_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version_number?: number
          viewer_height?: number | null
          viewer_width?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          drawing_id?: string
          file_id?: string | null
          file_url?: string | null
          id?: string
          is_current?: boolean
          issued_at?: string | null
          pdf_page?: number | null
          project_id?: string
          received_at?: string | null
          release_status?: string
          revision_code?: string
          revision_name?: string | null
          revision_notes?: string | null
          revision_reason?: string | null
          revision_source?: string | null
          sheet_number?: string
          sheet_title?: string
          supersedes_revision_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version_number?: number
          viewer_height?: number | null
          viewer_width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revisions_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_revisions_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revisions_supersedes_revision_id_fkey"
            columns: ["supersedes_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_revisions_supersedes_revision_id_fkey"
            columns: ["supersedes_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_sets: {
        Row: {
          area_sequence: string | null
          category: string
          created_at: string | null
          current_submittal_id: string | null
          deleted_at: string | null
          description: string | null
          detailing_state: string | null
          discipline: string | null
          due_date: string | null
          eor_reviewer: string | null
          failed_count: number | null
          file_url: string | null
          id: string
          is_deleted: boolean
          is_locked: boolean
          issued_by: string | null
          issued_date: string | null
          linked_work_package_ids: string[] | null
          locked_at: string | null
          locked_by: string | null
          locked_reason: string | null
          long_lead_impact: boolean | null
          material_impacted: boolean | null
          metadata: Json | null
          needs_review_count: number | null
          notes: string | null
          processed_count: number | null
          project_id: string
          project_name: string | null
          register: string
          revision: string | null
          revision_history: string | null
          revision_summary: string | null
          set_approval_notes: string | null
          set_approval_status: string | null
          set_approved_by: string | null
          set_approved_date: string | null
          set_name: string | null
          sheet_count: number | null
          stage_summary: string | null
          status: string | null
          submittal_status: string | null
          titleblock_number_rect: Json | null
          titleblock_revision_rect: Json | null
          titleblock_title_rect: Json | null
          updated_at: string | null
          upload_batch_id: string | null
        }
        Insert: {
          area_sequence?: string | null
          category?: string
          created_at?: string | null
          current_submittal_id?: string | null
          deleted_at?: string | null
          description?: string | null
          detailing_state?: string | null
          discipline?: string | null
          due_date?: string | null
          eor_reviewer?: string | null
          failed_count?: number | null
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          is_locked?: boolean
          issued_by?: string | null
          issued_date?: string | null
          linked_work_package_ids?: string[] | null
          locked_at?: string | null
          locked_by?: string | null
          locked_reason?: string | null
          long_lead_impact?: boolean | null
          material_impacted?: boolean | null
          metadata?: Json | null
          needs_review_count?: number | null
          notes?: string | null
          processed_count?: number | null
          project_id: string
          project_name?: string | null
          register?: string
          revision?: string | null
          revision_history?: string | null
          revision_summary?: string | null
          set_approval_notes?: string | null
          set_approval_status?: string | null
          set_approved_by?: string | null
          set_approved_date?: string | null
          set_name?: string | null
          sheet_count?: number | null
          stage_summary?: string | null
          status?: string | null
          submittal_status?: string | null
          titleblock_number_rect?: Json | null
          titleblock_revision_rect?: Json | null
          titleblock_title_rect?: Json | null
          updated_at?: string | null
          upload_batch_id?: string | null
        }
        Update: {
          area_sequence?: string | null
          category?: string
          created_at?: string | null
          current_submittal_id?: string | null
          deleted_at?: string | null
          description?: string | null
          detailing_state?: string | null
          discipline?: string | null
          due_date?: string | null
          eor_reviewer?: string | null
          failed_count?: number | null
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          is_locked?: boolean
          issued_by?: string | null
          issued_date?: string | null
          linked_work_package_ids?: string[] | null
          locked_at?: string | null
          locked_by?: string | null
          locked_reason?: string | null
          long_lead_impact?: boolean | null
          material_impacted?: boolean | null
          metadata?: Json | null
          needs_review_count?: number | null
          notes?: string | null
          processed_count?: number | null
          project_id?: string
          project_name?: string | null
          register?: string
          revision?: string | null
          revision_history?: string | null
          revision_summary?: string | null
          set_approval_notes?: string | null
          set_approval_status?: string | null
          set_approved_by?: string | null
          set_approved_date?: string | null
          set_name?: string | null
          sheet_count?: number | null
          stage_summary?: string | null
          status?: string | null
          submittal_status?: string | null
          titleblock_number_rect?: Json | null
          titleblock_revision_rect?: Json | null
          titleblock_title_rect?: Json | null
          updated_at?: string | null
          upload_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_sets_current_submittal_id_fkey"
            columns: ["current_submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_sets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_sheets: {
        Row: {
          analysis_id: string | null
          created_at: string | null
          id: string
          page_index: number | null
          sheet_category: string | null
          sheet_number: string
          sheet_title: string | null
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string | null
          id?: string
          page_index?: number | null
          sheet_category?: string | null
          sheet_number: string
          sheet_title?: string | null
        }
        Update: {
          analysis_id?: string | null
          created_at?: string | null
          id?: string
          page_index?: number | null
          sheet_category?: string | null
          sheet_number?: string
          sheet_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_sheets_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "drawing_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_signoffs: {
        Row: {
          created_at: string
          drawing_id: string
          drawing_revision_id: string
          height: number | null
          id: string
          is_voided: boolean
          metadata: Json
          notes: string | null
          pdf_page: number | null
          project_id: string
          rotation_deg: number | null
          signature_url: string | null
          stamp_type: string
          stamped_at: string
          stamped_by_id: string | null
          stamped_by_name: string | null
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
          width: number | null
          x: number | null
          y: number | null
        }
        Insert: {
          created_at?: string
          drawing_id: string
          drawing_revision_id: string
          height?: number | null
          id?: string
          is_voided?: boolean
          metadata?: Json
          notes?: string | null
          pdf_page?: number | null
          project_id: string
          rotation_deg?: number | null
          signature_url?: string | null
          stamp_type: string
          stamped_at?: string
          stamped_by_id?: string | null
          stamped_by_name?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
          width?: number | null
          x?: number | null
          y?: number | null
        }
        Update: {
          created_at?: string
          drawing_id?: string
          drawing_revision_id?: string
          height?: number | null
          id?: string
          is_voided?: boolean
          metadata?: Json
          notes?: string | null
          pdf_page?: number | null
          project_id?: string
          rotation_deg?: number | null
          signature_url?: string | null
          stamp_type?: string
          stamped_at?: string
          stamped_by_id?: string | null
          stamped_by_name?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
          width?: number | null
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_signoffs_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_signoffs_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_signoffs_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_signoffs_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_signoffs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_transmittal_activity: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          project_id: string
          reason: string | null
          to_status: string | null
          transmittal_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json
          project_id: string
          reason?: string | null
          to_status?: string | null
          transmittal_id: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          project_id?: string
          reason?: string | null
          to_status?: string | null
          transmittal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_transmittal_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_transmittal_activity_transmittal_id_fkey"
            columns: ["transmittal_id"]
            isOneToOne: false
            referencedRelation: "drawing_transmittals"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_transmittal_items: {
        Row: {
          created_at: string
          drawing_id: string | null
          drawing_revision_id: string | null
          gc_drawing_id: string | null
          id: string
          notes: string | null
          number_at_send: string | null
          project_id: string
          revision_at_send: string | null
          sort_order: number
          title_at_send: string | null
          transmittal_id: string
        }
        Insert: {
          created_at?: string
          drawing_id?: string | null
          drawing_revision_id?: string | null
          gc_drawing_id?: string | null
          id?: string
          notes?: string | null
          number_at_send?: string | null
          project_id: string
          revision_at_send?: string | null
          sort_order?: number
          title_at_send?: string | null
          transmittal_id: string
        }
        Update: {
          created_at?: string
          drawing_id?: string | null
          drawing_revision_id?: string | null
          gc_drawing_id?: string | null
          id?: string
          notes?: string | null
          number_at_send?: string | null
          project_id?: string
          revision_at_send?: string | null
          sort_order?: number
          title_at_send?: string | null
          transmittal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_transmittal_items_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_transmittal_items_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_transmittal_items_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_transmittal_items_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_transmittal_items_gc_drawing_id_fkey"
            columns: ["gc_drawing_id"]
            isOneToOne: false
            referencedRelation: "gc_drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_transmittal_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_transmittal_items_transmittal_id_fkey"
            columns: ["transmittal_id"]
            isOneToOne: false
            referencedRelation: "drawing_transmittals"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_transmittals: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_name: string | null
          acknowledged_notes: string | null
          created_at: string
          created_by: string | null
          date_received: string | null
          date_sent: string | null
          deleted_at: string | null
          direction: string
          id: string
          is_deleted: boolean
          metadata: Json
          notes: string | null
          project_id: string
          purpose: string | null
          received_from: string | null
          recipient_company: string | null
          recipient_email: string | null
          sent_by: string | null
          sent_by_name: string | null
          sent_to: string | null
          source_company: string | null
          status: string
          subject: string | null
          submittal_id: string | null
          submittal_round_id: string | null
          transmittal_number: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_name?: string | null
          acknowledged_notes?: string | null
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          date_sent?: string | null
          deleted_at?: string | null
          direction?: string
          id?: string
          is_deleted?: boolean
          metadata?: Json
          notes?: string | null
          project_id: string
          purpose?: string | null
          received_from?: string | null
          recipient_company?: string | null
          recipient_email?: string | null
          sent_by?: string | null
          sent_by_name?: string | null
          sent_to?: string | null
          source_company?: string | null
          status?: string
          subject?: string | null
          submittal_id?: string | null
          submittal_round_id?: string | null
          transmittal_number: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_name?: string | null
          acknowledged_notes?: string | null
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          date_sent?: string | null
          deleted_at?: string | null
          direction?: string
          id?: string
          is_deleted?: boolean
          metadata?: Json
          notes?: string | null
          project_id?: string
          purpose?: string | null
          received_from?: string | null
          recipient_company?: string | null
          recipient_email?: string | null
          sent_by?: string | null
          sent_by_name?: string | null
          sent_to?: string | null
          source_company?: string | null
          status?: string
          subject?: string | null
          submittal_id?: string | null
          submittal_round_id?: string | null
          transmittal_number?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_transmittals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_transmittals_submittal_id_fkey"
            columns: ["submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_transmittals_submittal_round_id_fkey"
            columns: ["submittal_round_id"]
            isOneToOne: false
            referencedRelation: "submittal_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_watchers: {
        Row: {
          created_at: string
          drawing_id: string
          project_id: string
          user_id: string
          watch_type: string
        }
        Insert: {
          created_at?: string
          drawing_id: string
          project_id: string
          user_id: string
          watch_type?: string
        }
        Update: {
          created_at?: string
          drawing_id?: string
          project_id?: string
          user_id?: string
          watch_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_watchers_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_watchers_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_watchers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_zone_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          drawing_id: string | null
          drawing_zone_id: string
          event_type: string
          from_value: string | null
          id: string
          metadata: Json
          project_id: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          drawing_id?: string | null
          drawing_zone_id: string
          event_type: string
          from_value?: string | null
          id?: string
          metadata?: Json
          project_id: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          drawing_id?: string | null
          drawing_zone_id?: string
          event_type?: string
          from_value?: string | null
          id?: string
          metadata?: Json
          project_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_zone_activity_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_zone_activity_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zone_activity_drawing_zone_id_fkey"
            columns: ["drawing_zone_id"]
            isOneToOne: false
            referencedRelation: "drawing_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zone_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_zone_dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          note: string | null
          project_id: string
          propagation_weight: number
          relationship: string
          removed_at: string | null
          removed_by: string | null
          source_zone_id: string
          target_zone_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          project_id: string
          propagation_weight?: number
          relationship: string
          removed_at?: string | null
          removed_by?: string | null
          source_zone_id: string
          target_zone_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          project_id?: string
          propagation_weight?: number
          relationship?: string
          removed_at?: string | null
          removed_by?: string | null
          source_zone_id?: string
          target_zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_zone_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zone_dependencies_source_zone_id_fkey"
            columns: ["source_zone_id"]
            isOneToOne: false
            referencedRelation: "drawing_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zone_dependencies_target_zone_id_fkey"
            columns: ["target_zone_id"]
            isOneToOne: false
            referencedRelation: "drawing_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_zone_proposals: {
        Row: {
          accepted_zone_id: string | null
          analysis_id: string | null
          cluster_size: number
          confidence: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          drawing_id: string
          drawing_revision_id: string | null
          finding_ids: string[]
          id: string
          merged_into_proposal_id: string | null
          metadata: Json
          polygon_points: Json | null
          project_id: string
          shape_type: string
          status: string
          suggested_label: string | null
          suggested_zone_type: string | null
          updated_at: string
          x_max: number | null
          x_min: number | null
          y_max: number | null
          y_min: number | null
        }
        Insert: {
          accepted_zone_id?: string | null
          analysis_id?: string | null
          cluster_size?: number
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          drawing_id: string
          drawing_revision_id?: string | null
          finding_ids?: string[]
          id?: string
          merged_into_proposal_id?: string | null
          metadata?: Json
          polygon_points?: Json | null
          project_id: string
          shape_type?: string
          status?: string
          suggested_label?: string | null
          suggested_zone_type?: string | null
          updated_at?: string
          x_max?: number | null
          x_min?: number | null
          y_max?: number | null
          y_min?: number | null
        }
        Update: {
          accepted_zone_id?: string | null
          analysis_id?: string | null
          cluster_size?: number
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          drawing_id?: string
          drawing_revision_id?: string | null
          finding_ids?: string[]
          id?: string
          merged_into_proposal_id?: string | null
          metadata?: Json
          polygon_points?: Json | null
          project_id?: string
          shape_type?: string
          status?: string
          suggested_label?: string | null
          suggested_zone_type?: string | null
          updated_at?: string
          x_max?: number | null
          x_min?: number | null
          y_max?: number | null
          y_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_zone_proposals_accepted_zone_id_fkey"
            columns: ["accepted_zone_id"]
            isOneToOne: false
            referencedRelation: "drawing_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zone_proposals_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "drawing_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zone_proposals_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_zone_proposals_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zone_proposals_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_zone_proposals_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zone_proposals_merged_into_proposal_id_fkey"
            columns: ["merged_into_proposal_id"]
            isOneToOne: false
            referencedRelation: "drawing_zone_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zone_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_zones: {
        Row: {
          confidence_score: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          detail_ref: string | null
          discipline_code: string | null
          drawing_id: string
          drawing_revision_id: string
          grid_ref: string | null
          id: string
          is_active: boolean
          is_manual_status_override: boolean
          label: string
          level_ref: string | null
          manual_status_note: string | null
          manual_status_override_at: string | null
          manual_status_override_by: string | null
          parent_zone_id: string | null
          polygon_points: Json | null
          project_id: string
          sequence_ref: string | null
          shape_type: string
          sort_order: number
          source_kind: string
          status: string
          status_computed_at: string | null
          status_computed_by: string | null
          status_reason: string | null
          updated_at: string
          updated_by: string | null
          x_max: number
          x_min: number
          y_max: number
          y_min: number
          zone_key: string
          zone_type: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          detail_ref?: string | null
          discipline_code?: string | null
          drawing_id: string
          drawing_revision_id: string
          grid_ref?: string | null
          id?: string
          is_active?: boolean
          is_manual_status_override?: boolean
          label: string
          level_ref?: string | null
          manual_status_note?: string | null
          manual_status_override_at?: string | null
          manual_status_override_by?: string | null
          parent_zone_id?: string | null
          polygon_points?: Json | null
          project_id: string
          sequence_ref?: string | null
          shape_type?: string
          sort_order?: number
          source_kind?: string
          status?: string
          status_computed_at?: string | null
          status_computed_by?: string | null
          status_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          x_max: number
          x_min: number
          y_max: number
          y_min: number
          zone_key: string
          zone_type?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          detail_ref?: string | null
          discipline_code?: string | null
          drawing_id?: string
          drawing_revision_id?: string
          grid_ref?: string | null
          id?: string
          is_active?: boolean
          is_manual_status_override?: boolean
          label?: string
          level_ref?: string | null
          manual_status_note?: string | null
          manual_status_override_at?: string | null
          manual_status_override_by?: string | null
          parent_zone_id?: string | null
          polygon_points?: Json | null
          project_id?: string
          sequence_ref?: string | null
          shape_type?: string
          sort_order?: number
          source_kind?: string
          status?: string
          status_computed_at?: string | null
          status_computed_by?: string | null
          status_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          x_max?: number
          x_min?: number
          y_max?: number
          y_min?: number
          zone_key?: string
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_zones_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "drawing_zones_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zones_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["current_revision_id"]
          },
          {
            foreignKeyName: "drawing_zones_drawing_revision_id_fkey"
            columns: ["drawing_revision_id"]
            isOneToOne: false
            referencedRelation: "drawing_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zones_parent_zone_id_fkey"
            columns: ["parent_zone_id"]
            isOneToOne: false
            referencedRelation: "drawing_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_zones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawings: {
        Row: {
          ai_extraction_error: string | null
          ai_extraction_source: string | null
          ai_extraction_status: string | null
          callouts: Json | null
          created_at: string | null
          deleted_at: string | null
          discipline: string | null
          drawing_id: string | null
          drawing_set_id: string | null
          drawing_set_name: string | null
          due_date: string | null
          extracted_text: string | null
          fabrication_finish_date: string | null
          fabrication_start_date: string | null
          file_url: string | null
          final_delivery_date: string | null
          hyperlinks: Json | null
          id: string
          ifc_status: string | null
          is_deleted: boolean
          is_superseded: boolean | null
          last_extracted_at: string | null
          linked_rfi_ids: string | null
          markup: Json | null
          markup_scale: number | null
          metadata: Json | null
          notes: string | null
          override_reason: string | null
          pdf_page: number | null
          priority_flag: boolean | null
          project_id: string
          project_name: string | null
          ready_for_install_date: string | null
          return_date: string | null
          reviewer: string | null
          revision_number: string | null
          scale_status: string | null
          set_approval_status: string | null
          set_approved_date: string | null
          sheet_number: string | null
          spec_section: string | null
          stage: string | null
          submitted_date: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string | null
          upload_batch_id: string | null
          upload_status: string | null
        }
        Insert: {
          ai_extraction_error?: string | null
          ai_extraction_source?: string | null
          ai_extraction_status?: string | null
          callouts?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          discipline?: string | null
          drawing_id?: string | null
          drawing_set_id?: string | null
          drawing_set_name?: string | null
          due_date?: string | null
          extracted_text?: string | null
          fabrication_finish_date?: string | null
          fabrication_start_date?: string | null
          file_url?: string | null
          final_delivery_date?: string | null
          hyperlinks?: Json | null
          id?: string
          ifc_status?: string | null
          is_deleted?: boolean
          is_superseded?: boolean | null
          last_extracted_at?: string | null
          linked_rfi_ids?: string | null
          markup?: Json | null
          markup_scale?: number | null
          metadata?: Json | null
          notes?: string | null
          override_reason?: string | null
          pdf_page?: number | null
          priority_flag?: boolean | null
          project_id: string
          project_name?: string | null
          ready_for_install_date?: string | null
          return_date?: string | null
          reviewer?: string | null
          revision_number?: string | null
          scale_status?: string | null
          set_approval_status?: string | null
          set_approved_date?: string | null
          sheet_number?: string | null
          spec_section?: string | null
          stage?: string | null
          submitted_date?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string | null
          upload_batch_id?: string | null
          upload_status?: string | null
        }
        Update: {
          ai_extraction_error?: string | null
          ai_extraction_source?: string | null
          ai_extraction_status?: string | null
          callouts?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          discipline?: string | null
          drawing_id?: string | null
          drawing_set_id?: string | null
          drawing_set_name?: string | null
          due_date?: string | null
          extracted_text?: string | null
          fabrication_finish_date?: string | null
          fabrication_start_date?: string | null
          file_url?: string | null
          final_delivery_date?: string | null
          hyperlinks?: Json | null
          id?: string
          ifc_status?: string | null
          is_deleted?: boolean
          is_superseded?: boolean | null
          last_extracted_at?: string | null
          linked_rfi_ids?: string | null
          markup?: Json | null
          markup_scale?: number | null
          metadata?: Json | null
          notes?: string | null
          override_reason?: string | null
          pdf_page?: number | null
          priority_flag?: boolean | null
          project_id?: string
          project_name?: string | null
          ready_for_install_date?: string | null
          return_date?: string | null
          reviewer?: string | null
          revision_number?: string | null
          scale_status?: string | null
          set_approval_status?: string | null
          set_approved_date?: string | null
          sheet_number?: string | null
          spec_section?: string | null
          stage?: string | null
          submitted_date?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string | null
          upload_batch_id?: string | null
          upload_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawings_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          access_token: string | null
          connection_type: string
          created_at: string
          created_by: string | null
          display_name: string | null
          email_address: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          project_id: string
          provider: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          connection_type?: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email_address: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          project_id: string
          provider?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          connection_type?: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email_address?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          project_id?: string
          provider?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_accounts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attachments: {
        Row: {
          content_hash: string | null
          content_type: string | null
          created_at: string
          document_id: string | null
          filename: string
          id: string
          is_filed: boolean
          message_id: string
          project_id: string
          size_bytes: number | null
          storage_bucket: string | null
          storage_path: string | null
        }
        Insert: {
          content_hash?: string | null
          content_type?: string | null
          created_at?: string
          document_id?: string | null
          filename: string
          id?: string
          is_filed?: boolean
          message_id: string
          project_id: string
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Update: {
          content_hash?: string | null
          content_type?: string | null
          created_at?: string
          document_id?: string | null
          filename?: string
          id?: string
          is_filed?: boolean
          message_id?: string
          project_id?: string
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_intake_queue: {
        Row: {
          attachments: Json | null
          body_html: string | null
          body_text: string | null
          classification_reason: string | null
          confidence: number | null
          created_at: string
          created_record_id: string | null
          created_record_type: string | null
          detected_type: string
          id: string
          project_id: string | null
          received_at: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_address: string
          sender_name: string | null
          source_mailbox: string | null
          source_message_id: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          classification_reason?: string | null
          confidence?: number | null
          created_at?: string
          created_record_id?: string | null
          created_record_type?: string | null
          detected_type?: string
          id?: string
          project_id?: string | null
          received_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_address?: string
          sender_name?: string | null
          source_mailbox?: string | null
          source_message_id: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          classification_reason?: string | null
          confidence?: number | null
          created_at?: string
          created_record_id?: string | null
          created_record_type?: string | null
          detected_type?: string
          id?: string
          project_id?: string | null
          received_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_address?: string
          sender_name?: string | null
          source_mailbox?: string | null
          source_message_id?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_intake_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_integration_settings: {
        Row: {
          assignment_rules: Json | null
          auto_classify: boolean
          created_at: string
          default_type: string | null
          id: string
          is_active: boolean
          mailbox_address: string
          project_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          assignment_rules?: Json | null
          auto_classify?: boolean
          created_at?: string
          default_type?: string | null
          id?: string
          is_active?: boolean
          mailbox_address: string
          project_id: string
          provider?: string
          updated_at?: string
        }
        Update: {
          assignment_rules?: Json | null
          auto_classify?: boolean
          created_at?: string
          default_type?: string | null
          id?: string
          is_active?: boolean
          mailbox_address?: string
          project_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_integration_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          account_id: string | null
          attachment_count: number
          body_html: string | null
          body_text: string | null
          cc: Json | null
          conversation_id: string | null
          created_at: string
          deleted_at: string | null
          direction: string
          external_id: string | null
          has_attachments: boolean
          id: string
          import_status: string
          in_reply_to: string | null
          is_deleted: boolean
          is_read: boolean
          is_starred: boolean
          labels: Json | null
          linked_entity_id: string | null
          linked_entity_type: string | null
          parsed_confidence: number | null
          parsed_metadata: Json | null
          parsed_type: string | null
          project_id: string
          received_at: string
          recipients: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_email: string
          sender_name: string | null
          sent_at: string | null
          sent_by: string | null
          subject: string | null
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          attachment_count?: number
          body_html?: string | null
          body_text?: string | null
          cc?: Json | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string
          external_id?: string | null
          has_attachments?: boolean
          id?: string
          import_status?: string
          in_reply_to?: string | null
          is_deleted?: boolean
          is_read?: boolean
          is_starred?: boolean
          labels?: Json | null
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          parsed_confidence?: number | null
          parsed_metadata?: Json | null
          parsed_type?: string | null
          project_id: string
          received_at: string
          recipients?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_email: string
          sender_name?: string | null
          sent_at?: string | null
          sent_by?: string | null
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          attachment_count?: number
          body_html?: string | null
          body_text?: string | null
          cc?: Json | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string
          external_id?: string | null
          has_attachments?: boolean
          id?: string
          import_status?: string
          in_reply_to?: string | null
          is_deleted?: boolean
          is_read?: boolean
          is_starred?: boolean
          labels?: Json | null
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          parsed_confidence?: number | null
          parsed_metadata?: Json | null
          parsed_type?: string | null
          project_id?: string
          received_at?: string
          recipients?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_email?: string
          sender_name?: string | null
          sent_at?: string | null
          sent_by?: string | null
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number | null
          approved_by: string | null
          approved_date: string | null
          cost_code: string | null
          cost_code_id: string | null
          cost_code_name: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          expense_date: string | null
          expense_number: string | null
          expense_type: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          is_deleted: boolean
          metadata: Json | null
          notes: string | null
          paid_by: string | null
          payment_date: string | null
          payment_status: string | null
          project_id: string
          project_name: string | null
          quantity: number | null
          receipt_path: string | null
          receipt_url: string | null
          sov_line_item_id: string | null
          sov_line_item_name: string | null
          submitted_by: string | null
          submitted_date: string | null
          tags: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string | null
          vendor: string | null
          vendor_id: string | null
          void_reason: string | null
          work_package_id: string | null
          work_package_name: string | null
        }
        Insert: {
          amount?: number | null
          approved_by?: string | null
          approved_date?: string | null
          cost_code?: string | null
          cost_code_id?: string | null
          cost_code_name?: string | null
          created_at?: string | null
          created_by?: string | null
          decision_notes?: string | null
          deleted_at?: string | null
          description?: string | null
          expense_date?: string | null
          expense_number?: string | null
          expense_type?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_deleted?: boolean
          metadata?: Json | null
          notes?: string | null
          paid_by?: string | null
          payment_date?: string | null
          payment_status?: string | null
          project_id: string
          project_name?: string | null
          quantity?: number | null
          receipt_path?: string | null
          receipt_url?: string | null
          sov_line_item_id?: string | null
          sov_line_item_name?: string | null
          submitted_by?: string | null
          submitted_date?: string | null
          tags?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          vendor?: string | null
          vendor_id?: string | null
          void_reason?: string | null
          work_package_id?: string | null
          work_package_name?: string | null
        }
        Update: {
          amount?: number | null
          approved_by?: string | null
          approved_date?: string | null
          cost_code?: string | null
          cost_code_id?: string | null
          cost_code_name?: string | null
          created_at?: string | null
          created_by?: string | null
          decision_notes?: string | null
          deleted_at?: string | null
          description?: string | null
          expense_date?: string | null
          expense_number?: string | null
          expense_type?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_deleted?: boolean
          metadata?: Json | null
          notes?: string | null
          paid_by?: string | null
          payment_date?: string | null
          payment_status?: string | null
          project_id?: string
          project_name?: string | null
          quantity?: number | null
          receipt_path?: string | null
          receipt_url?: string | null
          sov_line_item_id?: string | null
          sov_line_item_name?: string | null
          submitted_by?: string | null
          submitted_date?: string | null
          tags?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          vendor?: string | null
          vendor_id?: string | null
          void_reason?: string | null
          work_package_id?: string | null
          work_package_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_cost_code_id_fkey"
            columns: ["cost_code_id"]
            isOneToOne: false
            referencedRelation: "cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      external_file_refs: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          drawing_set_id: string | null
          external_file_id: string | null
          file_size_bytes: number | null
          filename: string
          folder_name: string | null
          folder_url: string
          id: string
          is_deleted: boolean
          last_modified_at: string | null
          last_synced_at: string | null
          linked_document_id: string | null
          mime_type: string | null
          project_id: string
          provider: string
          sync_error: string | null
          sync_status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          drawing_set_id?: string | null
          external_file_id?: string | null
          file_size_bytes?: number | null
          filename: string
          folder_name?: string | null
          folder_url: string
          id?: string
          is_deleted?: boolean
          last_modified_at?: string | null
          last_synced_at?: string | null
          linked_document_id?: string | null
          mime_type?: string | null
          project_id: string
          provider: string
          sync_error?: string | null
          sync_status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          drawing_set_id?: string | null
          external_file_id?: string | null
          file_size_bytes?: number | null
          filename?: string
          folder_name?: string | null
          folder_url?: string
          id?: string
          is_deleted?: boolean
          last_modified_at?: string | null
          last_synced_at?: string | null
          linked_document_id?: string | null
          mime_type?: string | null
          project_id?: string
          provider?: string
          sync_error?: string | null
          sync_status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_file_refs_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_file_refs_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_file_refs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      external_linked_folders: {
        Row: {
          created_at: string | null
          drawing_set_id: string | null
          folder_name: string
          folder_url: string
          id: string
          last_synced_at: string | null
          linked_by: string | null
          project_id: string
          provider: string
          status: string
          sync_error: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          drawing_set_id?: string | null
          folder_name?: string
          folder_url: string
          id?: string
          last_synced_at?: string | null
          linked_by?: string | null
          project_id: string
          provider: string
          status?: string
          sync_error?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          drawing_set_id?: string | null
          folder_name?: string
          folder_url?: string
          id?: string
          last_synced_at?: string | null
          linked_by?: string | null
          project_id?: string
          provider?: string
          status?: string
          sync_error?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_linked_folders_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_linked_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      fab_release_log: {
        Row: {
          blockers: Json
          blocking_rfi_numbers: string[]
          created_at: string
          drawing_count: number
          drawing_ids: string[]
          drawing_set_id: string | null
          governing_stage: string | null
          id: string
          is_override: boolean
          metadata: Json
          notes: string | null
          override_reason: string | null
          package_kind: string
          package_name: string | null
          project_id: string
          released_at: string
          released_by: string | null
          released_by_name: string | null
          submittal_id: string | null
        }
        Insert: {
          blockers?: Json
          blocking_rfi_numbers?: string[]
          created_at?: string
          drawing_count?: number
          drawing_ids?: string[]
          drawing_set_id?: string | null
          governing_stage?: string | null
          id?: string
          is_override?: boolean
          metadata?: Json
          notes?: string | null
          override_reason?: string | null
          package_kind?: string
          package_name?: string | null
          project_id: string
          released_at?: string
          released_by?: string | null
          released_by_name?: string | null
          submittal_id?: string | null
        }
        Update: {
          blockers?: Json
          blocking_rfi_numbers?: string[]
          created_at?: string
          drawing_count?: number
          drawing_ids?: string[]
          drawing_set_id?: string | null
          governing_stage?: string | null
          id?: string
          is_override?: boolean
          metadata?: Json
          notes?: string | null
          override_reason?: string | null
          package_kind?: string
          package_name?: string | null
          project_id?: string
          released_at?: string
          released_by?: string | null
          released_by_name?: string | null
          submittal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fab_release_log_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fab_release_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fab_release_log_submittal_id_fkey"
            columns: ["submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
            referencedColumns: ["id"]
          },
        ]
      }
      fab_release_overrides: {
        Row: {
          blockers: Json
          blocking_rfi_numbers: string[]
          created_at: string
          drawing_count: number | null
          drawing_set_id: string | null
          fab_release_log_id: string | null
          id: string
          overridden_by: string | null
          overridden_by_name: string | null
          package_kind: string | null
          package_name: string | null
          project_id: string
          reason: string | null
          submittal_id: string | null
        }
        Insert: {
          blockers?: Json
          blocking_rfi_numbers?: string[]
          created_at?: string
          drawing_count?: number | null
          drawing_set_id?: string | null
          fab_release_log_id?: string | null
          id?: string
          overridden_by?: string | null
          overridden_by_name?: string | null
          package_kind?: string | null
          package_name?: string | null
          project_id: string
          reason?: string | null
          submittal_id?: string | null
        }
        Update: {
          blockers?: Json
          blocking_rfi_numbers?: string[]
          created_at?: string
          drawing_count?: number | null
          drawing_set_id?: string | null
          fab_release_log_id?: string | null
          id?: string
          overridden_by?: string | null
          overridden_by_name?: string | null
          package_kind?: string | null
          package_name?: string | null
          project_id?: string
          reason?: string | null
          submittal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fab_release_overrides_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fab_release_overrides_fab_release_log_id_fkey"
            columns: ["fab_release_log_id"]
            isOneToOne: false
            referencedRelation: "fab_release_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fab_release_overrides_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fab_release_overrides_submittal_id_fkey"
            columns: ["submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
            referencedColumns: ["id"]
          },
        ]
      }
      fab_releases: {
        Row: {
          canonical_release: boolean
          created_at: string | null
          exception_reason: string | null
          gate_snapshot: Json | null
          id: string
          is_deleted: boolean | null
          is_exception: boolean
          name: string
          notes: string | null
          piece_count: number | null
          piece_marks: string | null
          project_id: string | null
          release_date: string | null
          release_number: string
          release_source: string | null
          released_at: string | null
          released_by: string | null
          required_date: string | null
          risk_id: string | null
          status: string
          weight_tons: number | null
          work_package_id: string | null
        }
        Insert: {
          canonical_release?: boolean
          created_at?: string | null
          exception_reason?: string | null
          gate_snapshot?: Json | null
          id?: string
          is_deleted?: boolean | null
          is_exception?: boolean
          name: string
          notes?: string | null
          piece_count?: number | null
          piece_marks?: string | null
          project_id?: string | null
          release_date?: string | null
          release_number: string
          release_source?: string | null
          released_at?: string | null
          released_by?: string | null
          required_date?: string | null
          risk_id?: string | null
          status?: string
          weight_tons?: number | null
          work_package_id?: string | null
        }
        Update: {
          canonical_release?: boolean
          created_at?: string | null
          exception_reason?: string | null
          gate_snapshot?: Json | null
          id?: string
          is_deleted?: boolean | null
          is_exception?: boolean
          name?: string
          notes?: string | null
          piece_count?: number | null
          piece_marks?: string | null
          project_id?: string | null
          release_date?: string | null
          release_number?: string
          release_source?: string | null
          released_at?: string | null
          released_by?: string | null
          required_date?: string | null
          risk_id?: string | null
          status?: string
          weight_tons?: number | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fab_releases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fab_releases_risk_fk"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fab_releases_work_package_fk"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          flag_key: string
          id: string
          updated_at: string
          updated_by: string | null
          user_overrides: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_overrides?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_overrides?: Json
        }
        Relationships: []
      }
      gc_drawing_sets: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          discipline: string | null
          doc_number: string | null
          doc_type: string
          file_url: string | null
          id: string
          impact_notes: string | null
          is_deleted: boolean
          issued_by: string | null
          issued_date: string | null
          metadata: Json
          project_id: string
          received_date: string | null
          revision: string | null
          set_name: string
          sheet_count: number
          steel_impact: string
          titleblock_number_rect: Json | null
          titleblock_revision_rect: Json | null
          titleblock_title_rect: Json | null
          updated_at: string
          upload_batch_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          discipline?: string | null
          doc_number?: string | null
          doc_type?: string
          file_url?: string | null
          id?: string
          impact_notes?: string | null
          is_deleted?: boolean
          issued_by?: string | null
          issued_date?: string | null
          metadata?: Json
          project_id: string
          received_date?: string | null
          revision?: string | null
          set_name: string
          sheet_count?: number
          steel_impact?: string
          titleblock_number_rect?: Json | null
          titleblock_revision_rect?: Json | null
          titleblock_title_rect?: Json | null
          updated_at?: string
          upload_batch_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          discipline?: string | null
          doc_number?: string | null
          doc_type?: string
          file_url?: string | null
          id?: string
          impact_notes?: string | null
          is_deleted?: boolean
          issued_by?: string | null
          issued_date?: string | null
          metadata?: Json
          project_id?: string
          received_date?: string | null
          revision?: string | null
          set_name?: string
          sheet_count?: number
          steel_impact?: string
          titleblock_number_rect?: Json | null
          titleblock_revision_rect?: Json | null
          titleblock_title_rect?: Json | null
          updated_at?: string
          upload_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gc_drawing_sets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      gc_drawings: {
        Row: {
          ai_extraction_source: string | null
          ai_extraction_status: string
          created_at: string
          deleted_at: string | null
          discipline: string | null
          drawing_number: string | null
          extracted_text: string | null
          file_url: string | null
          gc_drawing_set_id: string
          id: string
          is_deleted: boolean
          is_superseded: boolean
          last_extracted_at: string | null
          metadata: Json
          pdf_page: number
          project_id: string
          revision: string | null
          superseded_by_id: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          upload_batch_id: string | null
          upload_status: string
        }
        Insert: {
          ai_extraction_source?: string | null
          ai_extraction_status?: string
          created_at?: string
          deleted_at?: string | null
          discipline?: string | null
          drawing_number?: string | null
          extracted_text?: string | null
          file_url?: string | null
          gc_drawing_set_id: string
          id?: string
          is_deleted?: boolean
          is_superseded?: boolean
          last_extracted_at?: string | null
          metadata?: Json
          pdf_page?: number
          project_id: string
          revision?: string | null
          superseded_by_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          upload_batch_id?: string | null
          upload_status?: string
        }
        Update: {
          ai_extraction_source?: string | null
          ai_extraction_status?: string
          created_at?: string
          deleted_at?: string | null
          discipline?: string | null
          drawing_number?: string | null
          extracted_text?: string | null
          file_url?: string | null
          gc_drawing_set_id?: string
          id?: string
          is_deleted?: boolean
          is_superseded?: boolean
          last_extracted_at?: string | null
          metadata?: Json
          pdf_page?: number
          project_id?: string
          revision?: string | null
          superseded_by_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          upload_batch_id?: string | null
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gc_drawings_gc_drawing_set_id_fkey"
            columns: ["gc_drawing_set_id"]
            isOneToOne: false
            referencedRelation: "gc_drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gc_drawings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gc_drawings_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "gc_drawings"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          completed_at: string | null
          corrective_actions: string | null
          created_at: string | null
          created_by: string | null
          deficiencies_count: number | null
          deleted_at: string | null
          description: string | null
          drawing_id: string | null
          findings: string | null
          id: string
          inspection_date: string | null
          inspection_number: string | null
          inspection_type: string | null
          inspector_name: string | null
          inspector_role: string | null
          is_deleted: boolean
          location: string | null
          metadata: Json | null
          notes: string | null
          phase: string | null
          project_id: string
          project_name: string | null
          sign_off_status: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          status: string
          updated_at: string | null
          work_package_id: string | null
        }
        Insert: {
          completed_at?: string | null
          corrective_actions?: string | null
          created_at?: string | null
          created_by?: string | null
          deficiencies_count?: number | null
          deleted_at?: string | null
          description?: string | null
          drawing_id?: string | null
          findings?: string | null
          id?: string
          inspection_date?: string | null
          inspection_number?: string | null
          inspection_type?: string | null
          inspector_name?: string | null
          inspector_role?: string | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          phase?: string | null
          project_id: string
          project_name?: string | null
          sign_off_status?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          updated_at?: string | null
          work_package_id?: string | null
        }
        Update: {
          completed_at?: string | null
          corrective_actions?: string | null
          created_at?: string | null
          created_by?: string | null
          deficiencies_count?: number | null
          deleted_at?: string | null
          description?: string | null
          drawing_id?: string | null
          findings?: string | null
          id?: string
          inspection_date?: string | null
          inspection_number?: string | null
          inspection_type?: string | null
          inspector_name?: string | null
          inspector_role?: string | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          phase?: string | null
          project_id?: string
          project_name?: string | null
          sign_off_status?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          updated_at?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "inspections_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      linked_folders: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          external_drive_id: string | null
          external_folder_id: string | null
          external_site_id: string | null
          folder_name: string
          folder_path: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          project_id: string
          provider: string
          sync_enabled: boolean
          sync_frequency: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_drive_id?: string | null
          external_folder_id?: string | null
          external_site_id?: string | null
          folder_name: string
          folder_path?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          project_id: string
          provider: string
          sync_enabled?: boolean
          sync_frequency?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_drive_id?: string | null
          external_folder_id?: string | null
          external_site_id?: string | null
          folder_name?: string
          folder_path?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          project_id?: string
          provider?: string
          sync_enabled?: boolean
          sync_frequency?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "linked_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_telemetry: {
        Row: {
          cost_usd: number | null
          error_kind: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          metadata: Json
          model: string
          occurred_at: string
          output_tokens: number | null
          project_id: string | null
          provider: string
          success: boolean
          use_case: string
          user_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          error_kind?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json
          model: string
          occurred_at?: string
          output_tokens?: number | null
          project_id?: string | null
          provider: string
          success?: boolean
          use_case?: string
          user_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          error_kind?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json
          model?: string
          occurred_at?: string
          output_tokens?: number | null
          project_id?: string | null
          provider?: string
          success?: boolean
          use_case?: string
          user_id?: string | null
        }
        Relationships: []
      }
      look_ahead: {
        Row: {
          activity: string | null
          constraints: string | null
          created_at: string | null
          crew: string | null
          forecast_end: string | null
          forecast_start: string | null
          id: string
          metadata: Json | null
          notes: string | null
          percent_complete: number
          phase: string | null
          planned_end: string | null
          planned_start: string | null
          project_id: string
          project_name: string | null
          status: string | null
          tasks: Json | null
          updated_at: string | null
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          activity?: string | null
          constraints?: string | null
          created_at?: string | null
          crew?: string | null
          forecast_end?: string | null
          forecast_start?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          percent_complete?: number
          phase?: string | null
          planned_end?: string | null
          planned_start?: string | null
          project_id: string
          project_name?: string | null
          status?: string | null
          tasks?: Json | null
          updated_at?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          activity?: string | null
          constraints?: string | null
          created_at?: string | null
          crew?: string | null
          forecast_end?: string | null
          forecast_start?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          percent_complete?: number
          phase?: string | null
          planned_end?: string | null
          planned_start?: string | null
          project_id?: string
          project_name?: string | null
          status?: string | null
          tasks?: Json | null
          updated_at?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "look_ahead_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      material_receipt_events: {
        Row: {
          id: string
          material_requirement_id: string
          next_state: string
          previous_state: string | null
          project_id: string
          provenance: Json
          receipt_reference: string | null
          receipt_source: string | null
          received_quantity: number | null
          recorded_at: string
          recorded_by: string
        }
        Insert: {
          id?: string
          material_requirement_id: string
          next_state: string
          previous_state?: string | null
          project_id: string
          provenance?: Json
          receipt_reference?: string | null
          receipt_source?: string | null
          received_quantity?: number | null
          recorded_at?: string
          recorded_by: string
        }
        Update: {
          id?: string
          material_requirement_id?: string
          next_state?: string
          previous_state?: string | null
          project_id?: string
          provenance?: Json
          receipt_reference?: string | null
          receipt_source?: string | null
          received_quantity?: number | null
          recorded_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_receipt_events_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_receipt_events_requirement_fk"
            columns: ["material_requirement_id"]
            isOneToOne: false
            referencedRelation: "material_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requirements: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          external_ref: string | null
          id: string
          is_deleted: boolean
          material_grade: string | null
          metadata: Json
          profile: string | null
          project_id: string
          quantity_required: number | null
          receipt_reference: string | null
          receipt_source: string | null
          receipt_state: string
          receipt_verified_at: string | null
          receipt_verified_by: string | null
          received_quantity: number | null
          requirement_code: string
          source_system: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          external_ref?: string | null
          id?: string
          is_deleted?: boolean
          material_grade?: string | null
          metadata?: Json
          profile?: string | null
          project_id: string
          quantity_required?: number | null
          receipt_reference?: string | null
          receipt_source?: string | null
          receipt_state?: string
          receipt_verified_at?: string | null
          receipt_verified_by?: string | null
          received_quantity?: number | null
          requirement_code: string
          source_system?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          external_ref?: string | null
          id?: string
          is_deleted?: boolean
          material_grade?: string | null
          metadata?: Json
          profile?: string | null
          project_id?: string
          quantity_required?: number | null
          receipt_reference?: string | null
          receipt_source?: string | null
          receipt_state?: string
          receipt_verified_at?: string | null
          receipt_verified_by?: string | null
          received_quantity?: number | null
          requirement_code?: string
          source_system?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_requirements_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string | null
          attendees: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          held_at: string | null
          held_by: string | null
          id: string
          is_deleted: boolean
          location: string | null
          meeting_date: string | null
          meeting_number: string | null
          meeting_type: string | null
          metadata: Json | null
          minutes: string | null
          next_meeting_date: string | null
          project_id: string
          project_name: string | null
          start_time: string | null
          status: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          agenda?: string | null
          attendees?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          held_at?: string | null
          held_by?: string | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_number?: string | null
          meeting_type?: string | null
          metadata?: Json | null
          minutes?: string | null
          next_meeting_date?: string | null
          project_id: string
          project_name?: string | null
          start_time?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          agenda?: string | null
          attendees?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          held_at?: string | null
          held_by?: string | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_number?: string | null
          meeting_type?: string | null
          metadata?: Json | null
          minutes?: string | null
          next_meeting_date?: string | null
          project_id?: string
          project_name?: string | null
          start_time?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      member_activity: {
        Row: {
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          new_role: string | null
          old_role: string | null
          project_id: string
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          new_role?: string | null
          old_role?: string | null
          project_id: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          new_role?: string | null
          old_role?: string | null
          project_id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mitigation_actions: {
        Row: {
          action_date: string | null
          action_type: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string
          follow_up_date: string | null
          follow_up_required: boolean | null
          id: string
          is_deleted: boolean
          mitigation_id: string
          outcome: string | null
          performed_by: string | null
          project_id: string
          proof_filename: string | null
          proof_url: string | null
          updated_at: string | null
        }
        Insert: {
          action_date?: string | null
          action_type?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description: string
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
          is_deleted?: boolean
          mitigation_id: string
          outcome?: string | null
          performed_by?: string | null
          project_id: string
          proof_filename?: string | null
          proof_url?: string | null
          updated_at?: string | null
        }
        Update: {
          action_date?: string | null
          action_type?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
          is_deleted?: boolean
          mitigation_id?: string
          outcome?: string | null
          performed_by?: string | null
          project_id?: string
          proof_filename?: string | null
          proof_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mitigation_actions_mitigation_id_fkey"
            columns: ["mitigation_id"]
            isOneToOne: false
            referencedRelation: "mitigation_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mitigation_actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mitigation_logs: {
        Row: {
          approval_date: string | null
          approved_by: string | null
          change_order_id: string | null
          cost_exposure: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          expected_recovery: number | null
          id: string
          identified_by: string | null
          identified_date: string | null
          impact_types: string | null
          internal_notes: string | null
          is_co_candidate: boolean | null
          is_deleted: boolean
          issue_source: string | null
          mitigation_number: string | null
          notice_method: string | null
          notice_sent_date: string | null
          notice_sent_to: string | null
          project_id: string
          recovery_likelihood: number | null
          responsible_party: string | null
          risk_id: string | null
          root_cause_category: string | null
          schedule_exposure_days: number | null
          source_entity_id: string | null
          source_entity_ref: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          approval_date?: string | null
          approved_by?: string | null
          change_order_id?: string | null
          cost_exposure?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          expected_recovery?: number | null
          id?: string
          identified_by?: string | null
          identified_date?: string | null
          impact_types?: string | null
          internal_notes?: string | null
          is_co_candidate?: boolean | null
          is_deleted?: boolean
          issue_source?: string | null
          mitigation_number?: string | null
          notice_method?: string | null
          notice_sent_date?: string | null
          notice_sent_to?: string | null
          project_id: string
          recovery_likelihood?: number | null
          responsible_party?: string | null
          risk_id?: string | null
          root_cause_category?: string | null
          schedule_exposure_days?: number | null
          source_entity_id?: string | null
          source_entity_ref?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          approval_date?: string | null
          approved_by?: string | null
          change_order_id?: string | null
          cost_exposure?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          expected_recovery?: number | null
          id?: string
          identified_by?: string | null
          identified_date?: string | null
          impact_types?: string | null
          internal_notes?: string | null
          is_co_candidate?: boolean | null
          is_deleted?: boolean
          issue_source?: string | null
          mitigation_number?: string | null
          notice_method?: string | null
          notice_sent_date?: string | null
          notice_sent_to?: string | null
          project_id?: string
          recovery_likelihood?: number | null
          responsible_party?: string | null
          risk_id?: string | null
          root_cause_category?: string | null
          schedule_exposure_days?: number | null
          source_entity_id?: string | null
          source_entity_ref?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mitigation_logs_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mitigation_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mitigation_logs_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      model_element_links: {
        Row: {
          created_at: string | null
          element_id: string
          entity_id: string
          entity_type: string
          id: string
          model_id: string
          note: string | null
          project_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          element_id: string
          entity_id: string
          entity_type: string
          id?: string
          model_id: string
          note?: string | null
          project_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          element_id?: string
          entity_id?: string
          entity_type?: string
          id?: string
          model_id?: string
          note?: string | null
          project_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_element_links_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_element_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      model_elements: {
        Row: {
          assembly_mark: string | null
          created_at: string
          deleted_at: string | null
          drawing_id: string | null
          drawing_no: string | null
          drawing_set_id: string | null
          element_guid: string | null
          erection_area: string | null
          fab_status: string | null
          id: string
          is_deleted: boolean
          material_grade: string | null
          metadata: Json
          model_id: string | null
          piece_id: string | null
          piece_mark: string
          profile: string | null
          project_id: string
          quantity: number
          sequence_number: string | null
          source: string
          updated_at: string
          weight_kg: number | null
          work_package_id: string | null
        }
        Insert: {
          assembly_mark?: string | null
          created_at?: string
          deleted_at?: string | null
          drawing_id?: string | null
          drawing_no?: string | null
          drawing_set_id?: string | null
          element_guid?: string | null
          erection_area?: string | null
          fab_status?: string | null
          id?: string
          is_deleted?: boolean
          material_grade?: string | null
          metadata?: Json
          model_id?: string | null
          piece_id?: string | null
          piece_mark: string
          profile?: string | null
          project_id: string
          quantity?: number
          sequence_number?: string | null
          source?: string
          updated_at?: string
          weight_kg?: number | null
          work_package_id?: string | null
        }
        Update: {
          assembly_mark?: string | null
          created_at?: string
          deleted_at?: string | null
          drawing_id?: string | null
          drawing_no?: string | null
          drawing_set_id?: string | null
          element_guid?: string | null
          erection_area?: string | null
          fab_status?: string | null
          id?: string
          is_deleted?: boolean
          material_grade?: string | null
          metadata?: Json
          model_id?: string | null
          piece_id?: string | null
          piece_mark?: string
          profile?: string | null
          project_id?: string
          quantity?: number
          sequence_number?: string | null
          source?: string
          updated_at?: string
          weight_kg?: number | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_elements_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "model_elements_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_elements_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_elements_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_elements_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_elements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_elements_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      model_registry: {
        Row: {
          cloud_model_id: string | null
          cloud_url: string | null
          coordinate_system: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          element_count: number | null
          file_name: string
          file_type: string
          file_url: string | null
          id: string
          is_deleted: boolean
          linked_drawings: Json | null
          linked_rfis: Json | null
          linked_work_packages: Json | null
          metadata: Json | null
          notes: string | null
          project_id: string
          revision_number: number | null
          source: string
          status: string
          superseded_at: string | null
          superseded_by: string | null
          updated_at: string | null
          upload_date: string | null
          version: string | null
        }
        Insert: {
          cloud_model_id?: string | null
          cloud_url?: string | null
          coordinate_system?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          element_count?: number | null
          file_name: string
          file_type: string
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          linked_drawings?: Json | null
          linked_rfis?: Json | null
          linked_work_packages?: Json | null
          metadata?: Json | null
          notes?: string | null
          project_id: string
          revision_number?: number | null
          source?: string
          status?: string
          superseded_at?: string | null
          superseded_by?: string | null
          updated_at?: string | null
          upload_date?: string | null
          version?: string | null
        }
        Update: {
          cloud_model_id?: string | null
          cloud_url?: string | null
          coordinate_system?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          element_count?: number | null
          file_name?: string
          file_type?: string
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          linked_drawings?: Json | null
          linked_rfis?: Json | null
          linked_work_packages?: Json | null
          metadata?: Json | null
          notes?: string | null
          project_id?: string
          revision_number?: number | null
          source?: string
          status?: string
          superseded_at?: string | null
          superseded_by?: string | null
          updated_at?: string | null
          upload_date?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_registry_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_registry_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_registry_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      note_folder_audit_events: {
        Row: {
          accepted: boolean
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          error_code: string | null
          folder_id: string | null
          id: string
          metadata: Json
          org_id: string | null
        }
        Insert: {
          accepted: boolean
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          error_code?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json
          org_id?: string | null
        }
        Update: {
          accepted?: boolean
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          error_code?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_folder_audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      note_folder_job_links: {
        Row: {
          created_at: string
          created_by: string | null
          folder_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          folder_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          folder_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_folder_job_links_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_folder_job_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      note_folder_migrations: {
        Row: {
          general_notes_id: string
          migrated_at: string
          notes_after: number
          notes_before: number
          org_id: string
        }
        Insert: {
          general_notes_id: string
          migrated_at?: string
          notes_after: number
          notes_before: number
          org_id: string
        }
        Update: {
          general_notes_id?: string
          migrated_at?: string
          notes_after?: number
          notes_before?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_folder_migrations_general_notes_id_fkey"
            columns: ["general_notes_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_folder_migrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      note_folder_mutation_receipts: {
        Row: {
          command: string
          created_at: string
          idempotency_key: string
          org_id: string
          result: Json
        }
        Insert: {
          command: string
          created_at?: string
          idempotency_key: string
          org_id: string
          result: Json
        }
        Update: {
          command?: string
          created_at?: string
          idempotency_key?: string
          org_id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "note_folder_mutation_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      note_folders: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          id: string
          is_system: boolean
          link_mode: string
          name: string
          org_id: string
          parent_folder_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          link_mode?: string
          name: string
          org_id: string
          parent_folder_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          link_mode?: string
          name?: string
          org_id?: string
          parent_folder_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "note_folders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      number_sequences: {
        Row: {
          created_at: string | null
          id: string
          next_value: number | null
          project_id: string
          record_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          next_value?: number | null
          project_id: string
          record_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          next_value?: number | null
          project_id?: string
          record_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: string
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          current_period_end: string | null
          id: string
          member_default_project_role: string | null
          metadata: Json
          name: string
          plan: string
          slug: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          id?: string
          member_default_project_role?: string | null
          metadata?: Json
          name: string
          plan?: string
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          id?: string
          member_default_project_role?: string | null
          metadata?: Json
          name?: string
          plan?: string
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pay_application_lines: {
        Row: {
          balance_to_finish: number
          created_at: string
          description: string | null
          id: string
          line_item_number: string | null
          materials_stored: number
          metadata: Json
          pay_application_id: string
          percent_complete: number
          project_id: string
          retainage: number
          scheduled_value: number
          sort_order: number
          sov_item_id: string | null
          total_completed_stored: number
          updated_at: string | null
          work_completed_previous: number
          work_completed_this_period: number
        }
        Insert: {
          balance_to_finish?: number
          created_at?: string
          description?: string | null
          id?: string
          line_item_number?: string | null
          materials_stored?: number
          metadata?: Json
          pay_application_id: string
          percent_complete?: number
          project_id: string
          retainage?: number
          scheduled_value?: number
          sort_order?: number
          sov_item_id?: string | null
          total_completed_stored?: number
          updated_at?: string | null
          work_completed_previous?: number
          work_completed_this_period?: number
        }
        Update: {
          balance_to_finish?: number
          created_at?: string
          description?: string | null
          id?: string
          line_item_number?: string | null
          materials_stored?: number
          metadata?: Json
          pay_application_id?: string
          percent_complete?: number
          project_id?: string
          retainage?: number
          scheduled_value?: number
          sort_order?: number
          sov_item_id?: string | null
          total_completed_stored?: number
          updated_at?: string | null
          work_completed_previous?: number
          work_completed_this_period?: number
        }
        Relationships: [
          {
            foreignKeyName: "pay_application_lines_pay_application_id_fkey"
            columns: ["pay_application_id"]
            isOneToOne: false
            referencedRelation: "pay_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_application_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_application_lines_sov_item_id_fkey"
            columns: ["sov_item_id"]
            isOneToOne: false
            referencedRelation: "sov_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_applications: {
        Row: {
          application_label: string | null
          application_number: number
          approved_by: string | null
          balance_to_finish: number
          certified_date: string | null
          created_at: string
          created_by: string | null
          current_payment_due: number
          deleted_at: string | null
          id: string
          is_deleted: boolean
          less_previous_certificates: number
          metadata: Json
          net_change_orders: number
          notes: string | null
          original_contract_sum: number
          paid_date: string | null
          period_from: string | null
          period_to: string | null
          project_id: string
          retainage_percent: number
          sov_reconciles: boolean | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          total_completed_stored: number
          total_earned_less_retainage: number
          total_retainage: number
          updated_at: string
          void_reason: string | null
        }
        Insert: {
          application_label?: string | null
          application_number?: number
          approved_by?: string | null
          balance_to_finish?: number
          certified_date?: string | null
          created_at?: string
          created_by?: string | null
          current_payment_due?: number
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          less_previous_certificates?: number
          metadata?: Json
          net_change_orders?: number
          notes?: string | null
          original_contract_sum?: number
          paid_date?: string | null
          period_from?: string | null
          period_to?: string | null
          project_id: string
          retainage_percent?: number
          sov_reconciles?: boolean | null
          status?: string
          submitted_by?: string | null
          submitted_date?: string | null
          total_completed_stored?: number
          total_earned_less_retainage?: number
          total_retainage?: number
          updated_at?: string
          void_reason?: string | null
        }
        Update: {
          application_label?: string | null
          application_number?: number
          approved_by?: string | null
          balance_to_finish?: number
          certified_date?: string | null
          created_at?: string
          created_by?: string | null
          current_payment_due?: number
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          less_previous_certificates?: number
          metadata?: Json
          net_change_orders?: number
          notes?: string | null
          original_contract_sum?: number
          paid_date?: string | null
          period_from?: string | null
          period_to?: string | null
          project_id?: string
          retainage_percent?: number
          sov_reconciles?: boolean | null
          status?: string
          submitted_by?: string | null
          submitted_date?: string | null
          total_completed_stored?: number
          total_earned_less_retainage?: number
          total_retainage?: number
          updated_at?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pay_applications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          category: string | null
          client_op_id: string | null
          created_at: string | null
          created_by: string | null
          daily_log_id: string | null
          deleted_at: string | null
          description: string | null
          file_name: string | null
          file_url: string | null
          id: string
          inspection_id: string | null
          is_deleted: boolean
          location: string | null
          metadata: Json | null
          project_id: string
          project_name: string | null
          punchlist_item_id: string | null
          taken_date: string | null
          title: string | null
          updated_at: string | null
          work_package_id: string | null
        }
        Insert: {
          category?: string | null
          client_op_id?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_log_id?: string | null
          deleted_at?: string | null
          description?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          inspection_id?: string | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          project_id: string
          project_name?: string | null
          punchlist_item_id?: string | null
          taken_date?: string | null
          title?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Update: {
          category?: string | null
          client_op_id?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_log_id?: string | null
          deleted_at?: string | null
          description?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          inspection_id?: string | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          project_id?: string
          project_name?: string | null
          punchlist_item_id?: string | null
          taken_date?: string | null
          title?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_punchlist_item_id_fkey"
            columns: ["punchlist_item_id"]
            isOneToOne: false
            referencedRelation: "punchlist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_control_command_failures: {
        Row: {
          actor_id: string | null
          command_name: string
          context: Json
          entity_ids: string[]
          error_code: string
          error_detail: string | null
          error_message: string
          id: string
          occurred_at: string
          project_id: string
        }
        Insert: {
          actor_id?: string | null
          command_name: string
          context?: Json
          entity_ids?: string[]
          error_code: string
          error_detail?: string | null
          error_message: string
          id?: string
          occurred_at?: string
          project_id: string
        }
        Update: {
          actor_id?: string | null
          command_name?: string
          context?: Json
          entity_ids?: string[]
          error_code?: string
          error_detail?: string | null
          error_message?: string
          id?: string
          occurred_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_control_command_failures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_control_mode_events: {
        Row: {
          changed_at: string
          changed_by: string
          confirmation: string
          id: string
          next_mode: string
          previous_mode: string
          project_id: string
          readiness_snapshot: Json
        }
        Insert: {
          changed_at?: string
          changed_by: string
          confirmation: string
          id?: string
          next_mode: string
          previous_mode: string
          project_id: string
          readiness_snapshot?: Json
        }
        Update: {
          changed_at?: string
          changed_by?: string
          confirmation?: string
          id?: string
          next_mode?: string
          previous_mode?: string
          project_id?: string
          readiness_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "piece_control_mode_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_drawing_sets: {
        Row: {
          created_at: string
          created_by: string | null
          drawing_set_id: string
          id: string
          piece_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drawing_set_id: string
          id?: string
          piece_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drawing_set_id?: string
          id?: string
          piece_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_drawing_sets_piece_fk"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_drawing_sets_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_drawing_sets_set_fk"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_drawings: {
        Row: {
          created_at: string
          created_by: string | null
          drawing_id: string
          id: string
          piece_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          drawing_id: string
          id?: string
          piece_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          drawing_id?: string
          id?: string
          piece_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_drawings_drawing_fk"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "piece_drawings_drawing_fk"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_drawings_piece_fk"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_drawings_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          next_state: Json
          piece_id: string
          previous_state: Json
          project_id: string
          reason: string | null
          source_system: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          next_state?: Json
          piece_id: string
          previous_state?: Json
          project_id: string
          reason?: string | null
          source_system?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          next_state?: Json
          piece_id?: string
          previous_state?: Json
          project_id?: string
          reason?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "piece_events_piece_fk"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_events_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_import_batches: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          apply_summary: Json | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          decision_counts: Json
          id: string
          project_id: string
          row_count: number
          source_name: string | null
          source_type: string
          status: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          apply_summary?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decision_counts?: Json
          id?: string
          project_id: string
          row_count?: number
          source_name?: string | null
          source_type: string
          status?: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          apply_summary?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decision_counts?: Json
          id?: string
          project_id?: string
          row_count?: number
          source_name?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_import_batches_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_import_rows: {
        Row: {
          batch_id: string
          created_at: string
          decision: string
          id: string
          matched_piece_id: string | null
          normalized_payload: Json
          original_payload: Json
          project_id: string
          resolution: string | null
          source_row_number: number
          warnings: string[]
        }
        Insert: {
          batch_id: string
          created_at?: string
          decision: string
          id?: string
          matched_piece_id?: string | null
          normalized_payload?: Json
          original_payload: Json
          project_id: string
          resolution?: string | null
          source_row_number: number
          warnings?: string[]
        }
        Update: {
          batch_id?: string
          created_at?: string
          decision?: string
          id?: string
          matched_piece_id?: string | null
          normalized_payload?: Json
          original_payload?: Json
          project_id?: string
          resolution?: string | null
          source_row_number?: number
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "piece_import_rows_batch_fk"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "piece_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_import_rows_piece_fk"
            columns: ["matched_piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_import_rows_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_material_requirements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          material_requirement_id: string
          piece_id: string
          project_id: string
          quantity_allocated: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_requirement_id: string
          piece_id: string
          project_id: string
          quantity_allocated?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_requirement_id?: string
          piece_id?: string
          project_id?: string
          quantity_allocated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "piece_material_requirements_piece_fk"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_material_requirements_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_material_requirements_requirement_fk"
            columns: ["material_requirement_id"]
            isOneToOne: false
            referencedRelation: "material_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_production: {
        Row: {
          assembly_mark: string | null
          created_at: string
          erection_area: string | null
          external_ref: string | null
          id: string
          imported_at: string
          is_deleted: boolean
          notes: string | null
          percent_complete: number | null
          piece_mark: string
          project_id: string
          quantity: number | null
          sequence_number: string | null
          ship_date: string | null
          source: string
          stage_data: Json | null
          status: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          assembly_mark?: string | null
          created_at?: string
          erection_area?: string | null
          external_ref?: string | null
          id?: string
          imported_at?: string
          is_deleted?: boolean
          notes?: string | null
          percent_complete?: number | null
          piece_mark: string
          project_id: string
          quantity?: number | null
          sequence_number?: string | null
          ship_date?: string | null
          source?: string
          stage_data?: Json | null
          status?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          assembly_mark?: string | null
          created_at?: string
          erection_area?: string | null
          external_ref?: string | null
          id?: string
          imported_at?: string
          is_deleted?: boolean
          notes?: string | null
          percent_complete?: number | null
          piece_mark?: string
          project_id?: string
          quantity?: number | null
          sequence_number?: string | null
          ship_date?: string | null
          source?: string
          stage_data?: Json | null
          status?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "piece_production_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_station_completions: {
        Row: {
          completed_at: string
          completed_by: string
          created_at: string
          earned_percent: number
          id: string
          inherited_from_completion_id: string | null
          is_override: boolean
          metadata: Json
          override_reason: string | null
          piece_id: string
          project_id: string
          sort_order: number
          station_configuration_id: string
          station_key: string
          station_name: string
        }
        Insert: {
          completed_at?: string
          completed_by: string
          created_at?: string
          earned_percent: number
          id?: string
          inherited_from_completion_id?: string | null
          is_override?: boolean
          metadata?: Json
          override_reason?: string | null
          piece_id: string
          project_id: string
          sort_order: number
          station_configuration_id: string
          station_key: string
          station_name: string
        }
        Update: {
          completed_at?: string
          completed_by?: string
          created_at?: string
          earned_percent?: number
          id?: string
          inherited_from_completion_id?: string | null
          is_override?: boolean
          metadata?: Json
          override_reason?: string | null
          piece_id?: string
          project_id?: string
          sort_order?: number
          station_configuration_id?: string
          station_key?: string
          station_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_station_completions_inherited_from_completion_id_fkey"
            columns: ["inherited_from_completion_id"]
            isOneToOne: false
            referencedRelation: "piece_station_completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_station_completions_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_station_completions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_station_completions_station_configuration_id_fkey"
            columns: ["station_configuration_id"]
            isOneToOne: false
            referencedRelation: "piece_station_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_station_configurations: {
        Row: {
          created_at: string
          created_by: string | null
          earned_percent: number
          id: string
          is_active: boolean
          project_id: string
          sort_order: number
          station_key: string
          station_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          earned_percent: number
          id?: string
          is_active?: boolean
          project_id: string
          sort_order: number
          station_key: string
          station_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          earned_percent?: number
          id?: string
          is_active?: boolean
          project_id?: string
          sort_order?: number
          station_key?: string
          station_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "piece_station_configurations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pieces: {
        Row: {
          created_at: string
          current_station: string | null
          deleted_at: string | null
          erection_area: string | null
          external_ref: string | null
          id: string
          is_container: boolean
          is_deleted: boolean
          length_inches: number | null
          lifecycle_status: string
          lot_code: string
          material_grade: string | null
          metadata: Json
          normalized_piece_mark: string | null
          on_hold: boolean
          on_hold_at: string | null
          on_hold_by: string | null
          on_hold_reason: string | null
          parent_piece_id: string | null
          piece_mark: string
          profile: string | null
          project_id: string
          quantity: number
          sequence_number: string | null
          source_system: string | null
          updated_at: string
          weight_each_lbs: number | null
          weight_total_lbs: number | null
          work_package_id: string | null
        }
        Insert: {
          created_at?: string
          current_station?: string | null
          deleted_at?: string | null
          erection_area?: string | null
          external_ref?: string | null
          id?: string
          is_container?: boolean
          is_deleted?: boolean
          length_inches?: number | null
          lifecycle_status?: string
          lot_code?: string
          material_grade?: string | null
          metadata?: Json
          normalized_piece_mark?: string | null
          on_hold?: boolean
          on_hold_at?: string | null
          on_hold_by?: string | null
          on_hold_reason?: string | null
          parent_piece_id?: string | null
          piece_mark: string
          profile?: string | null
          project_id: string
          quantity?: number
          sequence_number?: string | null
          source_system?: string | null
          updated_at?: string
          weight_each_lbs?: number | null
          weight_total_lbs?: number | null
          work_package_id?: string | null
        }
        Update: {
          created_at?: string
          current_station?: string | null
          deleted_at?: string | null
          erection_area?: string | null
          external_ref?: string | null
          id?: string
          is_container?: boolean
          is_deleted?: boolean
          length_inches?: number | null
          lifecycle_status?: string
          lot_code?: string
          material_grade?: string | null
          metadata?: Json
          normalized_piece_mark?: string | null
          on_hold?: boolean
          on_hold_at?: string | null
          on_hold_by?: string | null
          on_hold_reason?: string | null
          parent_piece_id?: string | null
          piece_mark?: string
          profile?: string | null
          project_id?: string
          quantity?: number
          sequence_number?: string | null
          source_system?: string | null
          updated_at?: string
          weight_each_lbs?: number | null
          weight_total_lbs?: number | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pieces_parent_piece_fk"
            columns: ["parent_piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_work_package_fk"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_action_events: {
        Row: {
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          occurred_at: string
          project_id: string
        }
        Insert: {
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          occurred_at?: string
          project_id: string
        }
        Update: {
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          occurred_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_action_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_offline_operation_receipts: {
        Row: {
          applied_at: string
          canonical_payload: Json
          client_op_id: string
          entity_id: string
          entity_type: string
          operation_kind: string
          project_id: string
          stored_result: Json
          user_id: string
        }
        Insert: {
          applied_at?: string
          canonical_payload: Json
          client_op_id: string
          entity_id: string
          entity_type: string
          operation_kind: string
          project_id: string
          stored_result: Json
          user_id: string
        }
        Update: {
          applied_at?: string
          canonical_payload?: Json
          client_op_id?: string
          entity_id?: string
          entity_type?: string
          operation_kind?: string
          project_id?: string
          stored_result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_offline_operation_receipts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pma_assumptions: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          metadata: Json | null
          notes: string | null
          owner: string | null
          project_id: string
          project_name: string | null
          risk_id: string | null
          risk_level: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          notes?: string | null
          owner?: string | null
          project_id: string
          project_name?: string | null
          risk_id?: string | null
          risk_level?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          notes?: string | null
          owner?: string | null
          project_id?: string
          project_name?: string | null
          risk_id?: string | null
          risk_level?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pma_assumptions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pma_assumptions_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
        ]
      }
      pma_audit_logs: {
        Row: {
          action: string | null
          changed_by: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          project_id: string
          updated_at: string | null
        }
        Insert: {
          action?: string | null
          changed_by?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          project_id: string
          updated_at?: string | null
        }
        Update: {
          action?: string | null
          changed_by?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          project_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pma_audit_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pma_decisions: {
        Row: {
          alternatives: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          decided_by: string | null
          decision_date: string | null
          decision_number: string | null
          deleted_at: string | null
          description: string | null
          id: string
          impact: string | null
          is_deleted: boolean
          metadata: Json | null
          project_id: string
          project_name: string | null
          rationale: string | null
          risk_id: string | null
          status: string | null
          superseded_by_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          alternatives?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          decided_by?: string | null
          decision_date?: string | null
          decision_number?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          impact?: string | null
          is_deleted?: boolean
          metadata?: Json | null
          project_id: string
          project_name?: string | null
          rationale?: string | null
          risk_id?: string | null
          status?: string | null
          superseded_by_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          alternatives?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          decided_by?: string | null
          decision_date?: string | null
          decision_number?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          impact?: string | null
          is_deleted?: boolean
          metadata?: Json | null
          project_id?: string
          project_name?: string | null
          rationale?: string | null
          risk_id?: string | null
          status?: string | null
          superseded_by_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pma_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pma_decisions_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "risks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pma_decisions_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "pma_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_notes: {
        Row: {
          author: string | null
          category: string | null
          content: string | null
          created_at: string | null
          date: string | null
          date_due: string | null
          date_noted: string | null
          folder_id: string
          id: string
          is_high_priority: boolean | null
          is_resolved: boolean | null
          metadata: Json | null
          note_date: string | null
          notes: string | null
          project_id: string
          project_name: string | null
          resolved_date: string | null
          shift: string | null
          sketch_data: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          date?: string | null
          date_due?: string | null
          date_noted?: string | null
          folder_id: string
          id?: string
          is_high_priority?: boolean | null
          is_resolved?: boolean | null
          metadata?: Json | null
          note_date?: string | null
          notes?: string | null
          project_id: string
          project_name?: string | null
          resolved_date?: string | null
          shift?: string | null
          sketch_data?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          date?: string | null
          date_due?: string | null
          date_noted?: string | null
          folder_id?: string
          id?: string
          is_high_priority?: boolean | null
          is_resolved?: boolean | null
          metadata?: Json | null
          note_date?: string | null
          notes?: string | null
          project_id?: string
          project_name?: string | null
          resolved_date?: string | null
          shift?: string | null
          sketch_data?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_notes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_calendars: {
        Row: {
          created_at: string
          holidays: string[]
          project_id: string
          shift_label: string | null
          updated_at: string
          work_days: number[]
        }
        Insert: {
          created_at?: string
          holidays?: string[]
          project_id: string
          shift_label?: string | null
          updated_at?: string
          work_days?: number[]
        }
        Update: {
          created_at?: string
          holidays?: string[]
          project_id?: string
          shift_label?: string | null
          updated_at?: string
          work_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "project_calendars_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_closeout: {
        Row: {
          as_built_complete: boolean | null
          blockers_at_completion: Json | null
          certificate_of_occupancy: string | null
          checklist: Json | null
          closeout_date: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          final_completion_date: string | null
          final_inspection_date: string | null
          id: string
          is_deleted: boolean
          manuals_complete: boolean | null
          metadata: Json | null
          notes: string | null
          override_by: string | null
          override_reason: string | null
          project_id: string
          project_name: string | null
          punchlist_complete: boolean | null
          reopen_reason: string | null
          status: string | null
          substantial_completion_date: string | null
          updated_at: string | null
          warranties_complete: boolean | null
        }
        Insert: {
          as_built_complete?: boolean | null
          blockers_at_completion?: Json | null
          certificate_of_occupancy?: string | null
          checklist?: Json | null
          closeout_date?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          final_completion_date?: string | null
          final_inspection_date?: string | null
          id?: string
          is_deleted?: boolean
          manuals_complete?: boolean | null
          metadata?: Json | null
          notes?: string | null
          override_by?: string | null
          override_reason?: string | null
          project_id: string
          project_name?: string | null
          punchlist_complete?: boolean | null
          reopen_reason?: string | null
          status?: string | null
          substantial_completion_date?: string | null
          updated_at?: string | null
          warranties_complete?: boolean | null
        }
        Update: {
          as_built_complete?: boolean | null
          blockers_at_completion?: Json | null
          certificate_of_occupancy?: string | null
          checklist?: Json | null
          closeout_date?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          final_completion_date?: string | null
          final_inspection_date?: string | null
          id?: string
          is_deleted?: boolean
          manuals_complete?: boolean | null
          metadata?: Json | null
          notes?: string | null
          override_by?: string | null
          override_reason?: string | null
          project_id?: string
          project_name?: string | null
          punchlist_complete?: boolean | null
          reopen_reason?: string | null
          status?: string | null
          substantial_completion_date?: string | null
          updated_at?: string | null
          warranties_complete?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "project_closeout_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_handoff_items: {
        Row: {
          category: string | null
          completed_by: string | null
          completed_by_id: string | null
          created_at: string
          created_by: string | null
          date_completed: string | null
          date_required: string | null
          deleted_at: string | null
          description: string
          id: string
          is_deleted: boolean
          notes: string | null
          owner: string | null
          project_id: string
          seq: number | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          completed_by?: string | null
          completed_by_id?: string | null
          created_at?: string
          created_by?: string | null
          date_completed?: string | null
          date_required?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          owner?: string | null
          project_id: string
          seq?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          completed_by?: string | null
          completed_by_id?: string | null
          created_at?: string
          created_by?: string | null
          date_completed?: string | null
          date_required?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          owner?: string | null
          project_id?: string
          seq?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_handoff_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          adjusted_contract_value: number | null
          approved_change_total: number
          client: string | null
          contingency_amount: number | null
          contract_type: string | null
          created_at: string | null
          deck_installer: string | null
          deck_manufacturer: string | null
          deleted_at: string | null
          detailer_contact_id: string | null
          drawing_date: string | null
          engineer_of_record: string | null
          engineering_firm: string | null
          forecast_completion_date: string | null
          gc_contract_present: boolean | null
          general_contractor: string | null
          health_status: string
          id: string
          is_deleted: boolean
          job_type: string | null
          joist_manufacturer: string | null
          kickoff_complete: boolean | null
          kickoff_completed_at: string | null
          liquidated_damages: boolean | null
          loi_received_date: string | null
          metadata: Json | null
          name: string
          notes: string | null
          on_hold: boolean
          on_hold_at: string | null
          on_hold_by: string | null
          on_hold_reason: string | null
          org_id: string
          original_contract_value: number | null
          phase: string
          piece_control_mode: string
          project_manager: string | null
          project_number: string | null
          retainage_percent: number | null
          scope_complete_pct_override: number | null
          scope_complete_pct_override_date: string | null
          special_coatings: string | null
          start_date: string | null
          superintendent: string | null
          target_completion_date: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          adjusted_contract_value?: number | null
          approved_change_total?: number
          client?: string | null
          contingency_amount?: number | null
          contract_type?: string | null
          created_at?: string | null
          deck_installer?: string | null
          deck_manufacturer?: string | null
          deleted_at?: string | null
          detailer_contact_id?: string | null
          drawing_date?: string | null
          engineer_of_record?: string | null
          engineering_firm?: string | null
          forecast_completion_date?: string | null
          gc_contract_present?: boolean | null
          general_contractor?: string | null
          health_status?: string
          id?: string
          is_deleted?: boolean
          job_type?: string | null
          joist_manufacturer?: string | null
          kickoff_complete?: boolean | null
          kickoff_completed_at?: string | null
          liquidated_damages?: boolean | null
          loi_received_date?: string | null
          metadata?: Json | null
          name: string
          notes?: string | null
          on_hold?: boolean
          on_hold_at?: string | null
          on_hold_by?: string | null
          on_hold_reason?: string | null
          org_id: string
          original_contract_value?: number | null
          phase?: string
          piece_control_mode?: string
          project_manager?: string | null
          project_number?: string | null
          retainage_percent?: number | null
          scope_complete_pct_override?: number | null
          scope_complete_pct_override_date?: string | null
          special_coatings?: string | null
          start_date?: string | null
          superintendent?: string | null
          target_completion_date?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          adjusted_contract_value?: number | null
          approved_change_total?: number
          client?: string | null
          contingency_amount?: number | null
          contract_type?: string | null
          created_at?: string | null
          deck_installer?: string | null
          deck_manufacturer?: string | null
          deleted_at?: string | null
          detailer_contact_id?: string | null
          drawing_date?: string | null
          engineer_of_record?: string | null
          engineering_firm?: string | null
          forecast_completion_date?: string | null
          gc_contract_present?: boolean | null
          general_contractor?: string | null
          health_status?: string
          id?: string
          is_deleted?: boolean
          job_type?: string | null
          joist_manufacturer?: string | null
          kickoff_complete?: boolean | null
          kickoff_completed_at?: string | null
          liquidated_damages?: boolean | null
          loi_received_date?: string | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          on_hold?: boolean
          on_hold_at?: string | null
          on_hold_by?: string | null
          on_hold_reason?: string | null
          org_id?: string
          original_contract_value?: number | null
          phase?: string
          piece_control_mode?: string
          project_manager?: string | null
          project_number?: string | null
          retainage_percent?: number | null
          scope_complete_pct_override?: number | null
          scope_complete_pct_override_date?: string | null
          special_coatings?: string | null
          start_date?: string | null
          superintendent?: string | null
          target_completion_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_detailer_contact_id_fkey"
            columns: ["detailer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      punchlist_items: {
        Row: {
          assigned_to: string | null
          category: string | null
          client_op_id: string | null
          closed_at: string | null
          closed_by: string | null
          closing_photo_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          drawing_id: string | null
          id: string
          inspection_id: string | null
          is_deleted: boolean
          location: string | null
          metadata: Json | null
          notes: string | null
          percent_complete: number | null
          phase: string | null
          photos: Json | null
          priority: string
          project_id: string
          project_name: string | null
          status: string
          target_completion_date: string | null
          updated_at: string | null
          work_package_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          client_op_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_photo_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          drawing_id?: string | null
          id?: string
          inspection_id?: string | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          percent_complete?: number | null
          phase?: string | null
          photos?: Json | null
          priority?: string
          project_id: string
          project_name?: string | null
          status?: string
          target_completion_date?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          client_op_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_photo_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          drawing_id?: string | null
          id?: string
          inspection_id?: string | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          percent_complete?: number | null
          phase?: string | null
          photos?: Json | null
          priority?: string
          project_id?: string
          project_name?: string | null
          status?: string
          target_completion_date?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punchlist_items_closing_photo_id_fkey"
            columns: ["closing_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punchlist_items_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "punchlist_items_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punchlist_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punchlist_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punchlist_items_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_control_records: {
        Row: {
          acceptance_criteria: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          inspection_id: string | null
          is_deleted: boolean
          location: string | null
          material_or_component: string | null
          metadata: Json | null
          notes: string | null
          piece_id: string | null
          project_id: string
          project_name: string | null
          quantity_passed: number | null
          quantity_tested: number | null
          record_number: string | null
          result: string | null
          specification: string | null
          status: string | null
          test_date: string | null
          test_lab_or_inspector: string | null
          test_type: string | null
          test_value: string | null
          updated_at: string | null
          work_package_id: string | null
        }
        Insert: {
          acceptance_criteria?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inspection_id?: string | null
          is_deleted?: boolean
          location?: string | null
          material_or_component?: string | null
          metadata?: Json | null
          notes?: string | null
          piece_id?: string | null
          project_id: string
          project_name?: string | null
          quantity_passed?: number | null
          quantity_tested?: number | null
          record_number?: string | null
          result?: string | null
          specification?: string | null
          status?: string | null
          test_date?: string | null
          test_lab_or_inspector?: string | null
          test_type?: string | null
          test_value?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Update: {
          acceptance_criteria?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inspection_id?: string | null
          is_deleted?: boolean
          location?: string | null
          material_or_component?: string | null
          metadata?: Json | null
          notes?: string | null
          piece_id?: string | null
          project_id?: string
          project_name?: string | null
          quantity_passed?: number | null
          quantity_tested?: number | null
          record_number?: string | null
          result?: string | null
          specification?: string | null
          status?: string | null
          test_date?: string | null
          test_lab_or_inspector?: string | null
          test_type?: string | null
          test_value?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_control_records_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_control_records_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_control_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_control_records_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          availability: string | null
          capacity: number | null
          cost_rate: number | null
          created_at: string | null
          id: string
          metadata: Json | null
          name: string | null
          notes: string | null
          parent_resource_id: string | null
          project_id: string
          project_name: string | null
          resource_type: string | null
          role: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          availability?: string | null
          capacity?: number | null
          cost_rate?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          parent_resource_id?: string | null
          project_id: string
          project_name?: string | null
          resource_type?: string | null
          role?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          availability?: string | null
          capacity?: number | null
          cost_rate?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          parent_resource_id?: string | null
          project_id?: string
          project_name?: string | null
          resource_type?: string | null
          role?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_parent_resource_id_fkey"
            columns: ["parent_resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rfis: {
        Row: {
          answer: string | null
          answered_by: string | null
          answered_by_id: string | null
          area_sequence: string | null
          assigned_to: string | null
          ball_in_court: string | null
          closed_at: string | null
          closed_by: string | null
          cost_code_id: string | null
          cost_impact: boolean | null
          cost_impact_amount: number | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          date_answered: string | null
          date_required: string | null
          deleted_at: string | null
          description: string | null
          discipline: string | null
          distribution_list: string | null
          drawing_id: string | null
          drawing_reference: string | null
          drawing_set_id: string | null
          due_date: string | null
          gc_drawing_id: string | null
          holds_released_count: number
          id: string
          impacts_activity_ids: string[] | null
          internal_notes: string | null
          is_deleted: boolean
          metadata: Json | null
          priority: string
          project_id: string
          project_name: string | null
          question: string | null
          responded_date: string | null
          response_text: string | null
          rfi_number: string | null
          schedule_impact: boolean | null
          schedule_impact_days: number | null
          spec_section: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
          work_package_id: string | null
        }
        Insert: {
          answer?: string | null
          answered_by?: string | null
          answered_by_id?: string | null
          area_sequence?: string | null
          assigned_to?: string | null
          ball_in_court?: string | null
          closed_at?: string | null
          closed_by?: string | null
          cost_code_id?: string | null
          cost_impact?: boolean | null
          cost_impact_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          date_answered?: string | null
          date_required?: string | null
          deleted_at?: string | null
          description?: string | null
          discipline?: string | null
          distribution_list?: string | null
          drawing_id?: string | null
          drawing_reference?: string | null
          drawing_set_id?: string | null
          due_date?: string | null
          gc_drawing_id?: string | null
          holds_released_count?: number
          id?: string
          impacts_activity_ids?: string[] | null
          internal_notes?: string | null
          is_deleted?: boolean
          metadata?: Json | null
          priority?: string
          project_id: string
          project_name?: string | null
          question?: string | null
          responded_date?: string | null
          response_text?: string | null
          rfi_number?: string | null
          schedule_impact?: boolean | null
          schedule_impact_days?: number | null
          spec_section?: string | null
          status?: string
          submitted_by?: string | null
          submitted_date?: string | null
          title?: string | null
          updated_at?: string | null
          void_reason?: string | null
          work_package_id?: string | null
        }
        Update: {
          answer?: string | null
          answered_by?: string | null
          answered_by_id?: string | null
          area_sequence?: string | null
          assigned_to?: string | null
          ball_in_court?: string | null
          closed_at?: string | null
          closed_by?: string | null
          cost_code_id?: string | null
          cost_impact?: boolean | null
          cost_impact_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string | null
          date_answered?: string | null
          date_required?: string | null
          deleted_at?: string | null
          description?: string | null
          discipline?: string | null
          distribution_list?: string | null
          drawing_id?: string | null
          drawing_reference?: string | null
          drawing_set_id?: string | null
          due_date?: string | null
          gc_drawing_id?: string | null
          holds_released_count?: number
          id?: string
          impacts_activity_ids?: string[] | null
          internal_notes?: string | null
          is_deleted?: boolean
          metadata?: Json | null
          priority?: string
          project_id?: string
          project_name?: string | null
          question?: string | null
          responded_date?: string | null
          response_text?: string | null
          rfi_number?: string | null
          schedule_impact?: boolean | null
          schedule_impact_days?: number | null
          spec_section?: string | null
          status?: string
          submitted_by?: string | null
          submitted_date?: string | null
          title?: string | null
          updated_at?: string | null
          void_reason?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfis_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "rfis_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfis_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfis_gc_drawing_id_fkey"
            columns: ["gc_drawing_id"]
            isOneToOne: false
            referencedRelation: "gc_drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfis_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfis_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      risks: {
        Row: {
          category: string | null
          closed_date: string | null
          contingency_plan: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          identified_date: string | null
          impact: number
          is_deleted: boolean | null
          metadata: Json | null
          mitigation_plan: string | null
          notes: string | null
          owner: string | null
          probability: number
          project_id: string
          risk_number: string | null
          score: number | null
          severity: string | null
          status: string
          target_close_date: string | null
          title: string
          trigger_event: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          closed_date?: string | null
          contingency_plan?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          identified_date?: string | null
          impact: number
          is_deleted?: boolean | null
          metadata?: Json | null
          mitigation_plan?: string | null
          notes?: string | null
          owner?: string | null
          probability: number
          project_id: string
          risk_number?: string | null
          score?: number | null
          severity?: string | null
          status?: string
          target_close_date?: string | null
          title: string
          trigger_event?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          closed_date?: string | null
          contingency_plan?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          identified_date?: string | null
          impact?: number
          is_deleted?: boolean | null
          metadata?: Json | null
          mitigation_plan?: string | null
          notes?: string | null
          owner?: string | null
          probability?: number
          project_id?: string
          risk_number?: string | null
          score?: number | null
          severity?: string | null
          status?: string
          target_close_date?: string | null
          title?: string
          trigger_event?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_config: {
        Row: {
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      safety_incidents: {
        Row: {
          action_due_date: string | null
          closed_at: string | null
          closed_by: string | null
          corrective_actions: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          incident_date: string | null
          incident_number: string | null
          incident_time: string | null
          incident_type: string | null
          injuries: string | null
          investigation_completed: boolean | null
          is_deleted: boolean
          location: string | null
          metadata: Json | null
          notes: string | null
          phase: string | null
          project_id: string
          project_name: string | null
          reported_by: string | null
          responsible_party: string | null
          root_cause: string | null
          safety_trained: boolean | null
          severity: string
          status: string
          updated_at: string | null
          witnesses: string | null
        }
        Insert: {
          action_due_date?: string | null
          closed_at?: string | null
          closed_by?: string | null
          corrective_actions?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          incident_date?: string | null
          incident_number?: string | null
          incident_time?: string | null
          incident_type?: string | null
          injuries?: string | null
          investigation_completed?: boolean | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          phase?: string | null
          project_id: string
          project_name?: string | null
          reported_by?: string | null
          responsible_party?: string | null
          root_cause?: string | null
          safety_trained?: boolean | null
          severity?: string
          status?: string
          updated_at?: string | null
          witnesses?: string | null
        }
        Update: {
          action_due_date?: string | null
          closed_at?: string | null
          closed_by?: string | null
          corrective_actions?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          incident_date?: string | null
          incident_number?: string | null
          incident_time?: string | null
          incident_type?: string | null
          injuries?: string | null
          investigation_completed?: boolean | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          phase?: string | null
          project_id?: string
          project_name?: string | null
          reported_by?: string | null
          responsible_party?: string | null
          root_cause?: string | null
          safety_trained?: boolean | null
          severity?: string
          status?: string
          updated_at?: string | null
          witnesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_baseline_tasks: {
        Row: {
          baseline_duration: number | null
          baseline_finish: string | null
          baseline_id: string
          baseline_start: string | null
          id: string
          is_summary: boolean
          phase: string | null
          project_id: string
          task_id: string
          task_name: string | null
          wbs_code: string | null
        }
        Insert: {
          baseline_duration?: number | null
          baseline_finish?: string | null
          baseline_id: string
          baseline_start?: string | null
          id?: string
          is_summary?: boolean
          phase?: string | null
          project_id: string
          task_id: string
          task_name?: string | null
          wbs_code?: string | null
        }
        Update: {
          baseline_duration?: number | null
          baseline_finish?: string | null
          baseline_id?: string
          baseline_start?: string | null
          id?: string
          is_summary?: boolean
          phase?: string | null
          project_id?: string
          task_id?: string
          task_name?: string | null
          wbs_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_baseline_tasks_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "schedule_baselines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_baseline_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_baselines: {
        Row: {
          id: string
          is_original: boolean
          name: string
          project_id: string
          reason: string | null
          set_at: string
          set_by: string | null
          set_by_name: string | null
          task_count: number
        }
        Insert: {
          id?: string
          is_original?: boolean
          name: string
          project_id: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
          set_by_name?: string | null
          task_count?: number
        }
        Update: {
          id?: string
          is_original?: boolean
          name?: string
          project_id?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
          set_by_name?: string | null
          task_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_baselines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_tasks: {
        Row: {
          actual_finish_date: string | null
          actual_start_date: string | null
          assigned_to: string | null
          blockers: Json | null
          created_at: string | null
          created_by: string | null
          crew_id: string | null
          crew_name: string | null
          deleted_at: string | null
          dependencies: string | null
          duration: number | null
          end_date: string | null
          id: string
          is_deleted: boolean
          is_milestone: boolean | null
          is_summary: boolean
          metadata: Json | null
          milestone: boolean | null
          notes: string | null
          outline_level: number | null
          parent_task_id: string | null
          percent_complete: number | null
          phase: string | null
          priority: string | null
          project_id: string
          project_name: string | null
          related_action_item_ids: Json | null
          related_change_order_ids: Json | null
          related_rfi_ids: Json | null
          resource_names: string | null
          sort_order: number | null
          start_date: string | null
          status: string
          target_release: string | null
          task_name: string | null
          task_type: string | null
          updated_at: string | null
          wbs_code: string | null
          work_package_id: string | null
        }
        Insert: {
          actual_finish_date?: string | null
          actual_start_date?: string | null
          assigned_to?: string | null
          blockers?: Json | null
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          crew_name?: string | null
          deleted_at?: string | null
          dependencies?: string | null
          duration?: number | null
          end_date?: string | null
          id?: string
          is_deleted?: boolean
          is_milestone?: boolean | null
          is_summary?: boolean
          metadata?: Json | null
          milestone?: boolean | null
          notes?: string | null
          outline_level?: number | null
          parent_task_id?: string | null
          percent_complete?: number | null
          phase?: string | null
          priority?: string | null
          project_id: string
          project_name?: string | null
          related_action_item_ids?: Json | null
          related_change_order_ids?: Json | null
          related_rfi_ids?: Json | null
          resource_names?: string | null
          sort_order?: number | null
          start_date?: string | null
          status?: string
          target_release?: string | null
          task_name?: string | null
          task_type?: string | null
          updated_at?: string | null
          wbs_code?: string | null
          work_package_id?: string | null
        }
        Update: {
          actual_finish_date?: string | null
          actual_start_date?: string | null
          assigned_to?: string | null
          blockers?: Json | null
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          crew_name?: string | null
          deleted_at?: string | null
          dependencies?: string | null
          duration?: number | null
          end_date?: string | null
          id?: string
          is_deleted?: boolean
          is_milestone?: boolean | null
          is_summary?: boolean
          metadata?: Json | null
          milestone?: boolean | null
          notes?: string | null
          outline_level?: number | null
          parent_task_id?: string | null
          percent_complete?: number | null
          phase?: string | null
          priority?: string | null
          project_id?: string
          project_name?: string | null
          related_action_item_ids?: Json | null
          related_change_order_ids?: Json | null
          related_rfi_ids?: Json | null
          resource_names?: string | null
          sort_order?: number | null
          start_date?: string | null
          status?: string
          target_release?: string | null
          task_name?: string | null
          task_type?: string | null
          updated_at?: string | null
          wbs_code?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_tasks_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_items: {
        Row: {
          added_by: string | null
          category: string | null
          change_order_id: string | null
          completed_at: string | null
          completed_by: string | null
          completed_by_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_id: string | null
          file_name: string | null
          file_url: string | null
          id: string
          in_progress: boolean
          in_progress_at: string | null
          in_progress_by: string | null
          is_completed: boolean
          is_deleted: boolean
          item_type: string
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          reference: string | null
          scope_number: string | null
          sort_order: number | null
          storage_path: string | null
          updated_at: string | null
        }
        Insert: {
          added_by?: string | null
          category?: string | null
          change_order_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completed_by_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          in_progress?: boolean
          in_progress_at?: string | null
          in_progress_by?: string | null
          is_completed?: boolean
          is_deleted?: boolean
          item_type?: string
          metadata?: Json | null
          notes?: string | null
          project_id: string
          project_name?: string | null
          reference?: string | null
          scope_number?: string | null
          sort_order?: number | null
          storage_path?: string | null
          updated_at?: string | null
        }
        Update: {
          added_by?: string | null
          category?: string | null
          change_order_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completed_by_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          in_progress?: boolean
          in_progress_at?: string | null
          in_progress_by?: string | null
          is_completed?: boolean
          is_deleted?: boolean
          item_type?: string
          metadata?: Json | null
          notes?: string | null
          project_id?: string
          project_name?: string | null
          reference?: string | null
          scope_number?: string | null
          sort_order?: number | null
          storage_path?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scope_items_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sheets_config: {
        Row: {
          created_at: string
          id: string
          passcode_hash: string | null
          passcode_salt: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          passcode_hash?: string | null
          passcode_salt?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          passcode_hash?: string | null
          passcode_salt?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sheets_doc: {
        Row: {
          doc: Json
          id: string
          rev: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          doc?: Json
          id?: string
          rev?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          doc?: Json
          id?: string
          rev?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sheets_doc_backup: {
        Row: {
          backup_at: string
          doc: Json | null
          id: string
          note: string | null
          rev: number
        }
        Insert: {
          backup_at?: string
          doc?: Json | null
          id: string
          note?: string | null
          rev: number
        }
        Update: {
          backup_at?: string
          doc?: Json | null
          id?: string
          note?: string | null
          rev?: number
        }
        Relationships: []
      }
      sov_items: {
        Row: {
          application_number: number | null
          change_order_id: string | null
          cost_code: string | null
          cost_code_id: string | null
          cost_code_name: string | null
          created_at: string | null
          created_by: string | null
          current_percent_complete: number | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          line_item_number: number | null
          metadata: Json | null
          payment_received_date: string | null
          period_from: string | null
          period_to: string | null
          previous_percent_complete: number | null
          project_id: string
          project_name: string | null
          retainage_percent: number | null
          scheduled_value: number | null
          sort_order: number | null
          sov_id: string | null
          status: string | null
          submitted_date: string | null
          updated_at: string | null
          work_package_id: string | null
        }
        Insert: {
          application_number?: number | null
          change_order_id?: string | null
          cost_code?: string | null
          cost_code_id?: string | null
          cost_code_name?: string | null
          created_at?: string | null
          created_by?: string | null
          current_percent_complete?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          line_item_number?: number | null
          metadata?: Json | null
          payment_received_date?: string | null
          period_from?: string | null
          period_to?: string | null
          previous_percent_complete?: number | null
          project_id: string
          project_name?: string | null
          retainage_percent?: number | null
          scheduled_value?: number | null
          sort_order?: number | null
          sov_id?: string | null
          status?: string | null
          submitted_date?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Update: {
          application_number?: number | null
          change_order_id?: string | null
          cost_code?: string | null
          cost_code_id?: string | null
          cost_code_name?: string | null
          created_at?: string | null
          created_by?: string | null
          current_percent_complete?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          line_item_number?: number | null
          metadata?: Json | null
          payment_received_date?: string | null
          period_from?: string | null
          period_to?: string | null
          previous_percent_complete?: number | null
          project_id?: string
          project_name?: string | null
          retainage_percent?: number | null
          scheduled_value?: number | null
          sort_order?: number | null
          sov_id?: string | null
          status?: string | null
          submitted_date?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sov_items_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sov_items_cost_code_id_fkey"
            columns: ["cost_code_id"]
            isOneToOne: false
            referencedRelation: "cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sov_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sov_items_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      submittal_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_value: string | null
          id: string
          metadata: Json
          project_id: string
          submittal_id: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_value?: string | null
          id?: string
          metadata?: Json
          project_id: string
          submittal_id: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_value?: string | null
          id?: string
          metadata?: Json
          project_id?: string
          submittal_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submittal_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_activity_submittal_id_fkey"
            columns: ["submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
            referencedColumns: ["id"]
          },
        ]
      }
      submittal_comment_dispositions: {
        Row: {
          comment_number: string | null
          comment_text: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          drawing_id: string | null
          id: string
          incorporated_revision: string | null
          is_deleted: boolean
          is_required: boolean
          location: string | null
          metadata: Json
          project_id: string
          related_piece_ids: string[]
          related_rfi_id: string | null
          required_action: string | null
          resolution: string | null
          responsible_user_id: string | null
          source: string | null
          status: string
          submittal_id: string
          submittal_round_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          comment_number?: string | null
          comment_text?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          drawing_id?: string | null
          id?: string
          incorporated_revision?: string | null
          is_deleted?: boolean
          is_required?: boolean
          location?: string | null
          metadata?: Json
          project_id: string
          related_piece_ids?: string[]
          related_rfi_id?: string | null
          required_action?: string | null
          resolution?: string | null
          responsible_user_id?: string | null
          source?: string | null
          status?: string
          submittal_id: string
          submittal_round_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          comment_number?: string | null
          comment_text?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          drawing_id?: string | null
          id?: string
          incorporated_revision?: string | null
          is_deleted?: boolean
          is_required?: boolean
          location?: string | null
          metadata?: Json
          project_id?: string
          related_piece_ids?: string[]
          related_rfi_id?: string | null
          required_action?: string | null
          resolution?: string | null
          responsible_user_id?: string | null
          source?: string | null
          status?: string
          submittal_id?: string
          submittal_round_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submittal_comment_dispositions_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "submittal_comment_dispositions_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_comment_dispositions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_comment_dispositions_related_rfi_id_fkey"
            columns: ["related_rfi_id"]
            isOneToOne: false
            referencedRelation: "rfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_comment_dispositions_submittal_id_fkey"
            columns: ["submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_comment_dispositions_submittal_round_id_fkey"
            columns: ["submittal_round_id"]
            isOneToOne: false
            referencedRelation: "submittal_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      submittal_components: {
        Row: {
          created_at: string
          drawing_type: string
          id: string
          is_released: boolean
          notes: string | null
          project_id: string
          received_date: string | null
          released_date: string | null
          submittal_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          drawing_type: string
          id?: string
          is_released?: boolean
          notes?: string | null
          project_id: string
          received_date?: string | null
          released_date?: string | null
          submittal_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          drawing_type?: string
          id?: string
          is_released?: boolean
          notes?: string | null
          project_id?: string
          received_date?: string | null
          released_date?: string | null
          submittal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submittal_components_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_components_submittal_id_fkey"
            columns: ["submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
            referencedColumns: ["id"]
          },
        ]
      }
      submittal_rounds: {
        Row: {
          ball_in_court: string | null
          created_at: string
          deleted_at: string | null
          drawing_set_ids: string[]
          file_url: string | null
          id: string
          is_deleted: boolean
          markup_file_url: string | null
          metadata: Json
          project_id: string
          response_notes: string | null
          returned_date: string | null
          reviewer: string | null
          round_number: number
          status: string
          submittal_id: string
          submitted_by: string | null
          submitted_date: string | null
          updated_at: string
        }
        Insert: {
          ball_in_court?: string | null
          created_at?: string
          deleted_at?: string | null
          drawing_set_ids?: string[]
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          markup_file_url?: string | null
          metadata?: Json
          project_id: string
          response_notes?: string | null
          returned_date?: string | null
          reviewer?: string | null
          round_number?: number
          status?: string
          submittal_id: string
          submitted_by?: string | null
          submitted_date?: string | null
          updated_at?: string
        }
        Update: {
          ball_in_court?: string | null
          created_at?: string
          deleted_at?: string | null
          drawing_set_ids?: string[]
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          markup_file_url?: string | null
          metadata?: Json
          project_id?: string
          response_notes?: string | null
          returned_date?: string | null
          reviewer?: string | null
          round_number?: number
          status?: string
          submittal_id?: string
          submitted_by?: string | null
          submitted_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submittal_rounds_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_rounds_submittal_id_fkey"
            columns: ["submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
            referencedColumns: ["id"]
          },
        ]
      }
      submittal_sheet_responses: {
        Row: {
          created_at: string
          deleted_at: string | null
          drawing_id: string | null
          drawing_set_id: string | null
          id: string
          is_deleted: boolean
          markup_file_url: string | null
          metadata: Json
          project_id: string
          response_status: string
          reviewer_comment: string | null
          sheet_number: string | null
          submittal_round_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          drawing_id?: string | null
          drawing_set_id?: string | null
          id?: string
          is_deleted?: boolean
          markup_file_url?: string | null
          metadata?: Json
          project_id: string
          response_status?: string
          reviewer_comment?: string | null
          sheet_number?: string | null
          submittal_round_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          drawing_id?: string | null
          drawing_set_id?: string | null
          id?: string
          is_deleted?: boolean
          markup_file_url?: string | null
          metadata?: Json
          project_id?: string
          response_status?: string
          reviewer_comment?: string | null
          sheet_number?: string | null
          submittal_round_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submittal_sheet_responses_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_register_view"
            referencedColumns: ["drawing_id"]
          },
          {
            foreignKeyName: "submittal_sheet_responses_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_sheet_responses_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_sheet_responses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittal_sheet_responses_submittal_round_id_fkey"
            columns: ["submittal_round_id"]
            isOneToOne: false
            referencedRelation: "submittal_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      submittals: {
        Row: {
          approval_chain: Json | null
          approval_chain_step: number | null
          approved_date: string | null
          approver_notes: Json
          ball_in_court: string | null
          created_at: string | null
          current_round_id: string | null
          days_in_review: number | null
          deleted_at: string | null
          derived_stage: string | null
          discipline: string | null
          distributed_to: string | null
          drawing_set_ids: string[] | null
          external_id: string | null
          external_source: string | null
          fab_release_override_reason: string | null
          file_url: string | null
          gate_override_at: string | null
          gate_override_by: string | null
          gate_override_reason: string | null
          id: string
          is_deleted: boolean | null
          linked_rfi_ids: string[] | null
          linked_task_ids: string[] | null
          metadata: Json | null
          notes: string | null
          parent_submittal_id: string | null
          project_id: string
          project_name: string | null
          received_from: string | null
          required_date: string | null
          returned_date: string | null
          reviewer: string | null
          revision: string | null
          round_number: number | null
          spec_section: string | null
          split_reason: string | null
          stage_entered_at: string | null
          status: string
          submittal_number: string
          submittal_type: string | null
          submitted_by: string | null
          submitted_date: string | null
          title: string
          total_rounds: number
          transmittal_number: string | null
          updated_at: string | null
        }
        Insert: {
          approval_chain?: Json | null
          approval_chain_step?: number | null
          approved_date?: string | null
          approver_notes?: Json
          ball_in_court?: string | null
          created_at?: string | null
          current_round_id?: string | null
          days_in_review?: number | null
          deleted_at?: string | null
          derived_stage?: string | null
          discipline?: string | null
          distributed_to?: string | null
          drawing_set_ids?: string[] | null
          external_id?: string | null
          external_source?: string | null
          fab_release_override_reason?: string | null
          file_url?: string | null
          gate_override_at?: string | null
          gate_override_by?: string | null
          gate_override_reason?: string | null
          id?: string
          is_deleted?: boolean | null
          linked_rfi_ids?: string[] | null
          linked_task_ids?: string[] | null
          metadata?: Json | null
          notes?: string | null
          parent_submittal_id?: string | null
          project_id: string
          project_name?: string | null
          received_from?: string | null
          required_date?: string | null
          returned_date?: string | null
          reviewer?: string | null
          revision?: string | null
          round_number?: number | null
          spec_section?: string | null
          split_reason?: string | null
          stage_entered_at?: string | null
          status?: string
          submittal_number: string
          submittal_type?: string | null
          submitted_by?: string | null
          submitted_date?: string | null
          title: string
          total_rounds?: number
          transmittal_number?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_chain?: Json | null
          approval_chain_step?: number | null
          approved_date?: string | null
          approver_notes?: Json
          ball_in_court?: string | null
          created_at?: string | null
          current_round_id?: string | null
          days_in_review?: number | null
          deleted_at?: string | null
          derived_stage?: string | null
          discipline?: string | null
          distributed_to?: string | null
          drawing_set_ids?: string[] | null
          external_id?: string | null
          external_source?: string | null
          fab_release_override_reason?: string | null
          file_url?: string | null
          gate_override_at?: string | null
          gate_override_by?: string | null
          gate_override_reason?: string | null
          id?: string
          is_deleted?: boolean | null
          linked_rfi_ids?: string[] | null
          linked_task_ids?: string[] | null
          metadata?: Json | null
          notes?: string | null
          parent_submittal_id?: string | null
          project_id?: string
          project_name?: string | null
          received_from?: string | null
          required_date?: string | null
          returned_date?: string | null
          reviewer?: string | null
          revision?: string | null
          round_number?: number | null
          spec_section?: string | null
          split_reason?: string | null
          stage_entered_at?: string | null
          status?: string
          submittal_number?: string
          submittal_type?: string | null
          submitted_by?: string | null
          submitted_date?: string | null
          title?: string
          total_rounds?: number
          transmittal_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submittals_current_round_id_fkey"
            columns: ["current_round_id"]
            isOneToOne: false
            referencedRelation: "submittal_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittals_parent_submittal_id_fkey"
            columns: ["parent_submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submittals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string | null
          dependency_type: string
          id: string
          lag_days: number | null
          metadata: Json | null
          predecessor_id: string
          project_id: string
          successor_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dependency_type?: string
          id?: string
          lag_days?: number | null
          metadata?: Json | null
          predecessor_id: string
          project_id: string
          successor_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dependency_type?: string
          id?: string
          lag_days?: number | null
          metadata?: Json | null
          predecessor_id?: string
          project_id?: string
          successor_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_files: {
        Row: {
          content_type: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          metadata: Json | null
          project_id: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          project_id: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          metadata: Json | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          metadata?: Json | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          metadata?: Json | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_projects: {
        Row: {
          created_at: string | null
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          certifications: string | null
          certifications_expiry: string | null
          city: string | null
          company_name: string | null
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          insurance_expiry: string | null
          insurance_provider: string | null
          is_deleted: boolean
          is_preferred: boolean | null
          metadata: Json | null
          notes: string | null
          org_id: string | null
          payment_terms: string | null
          phone: string | null
          pricing_tier: string | null
          state: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          vendor_type: string | null
          website: string | null
          years_in_business: number | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          certifications?: string | null
          certifications_expiry?: string | null
          city?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_provider?: string | null
          is_deleted?: boolean
          is_preferred?: boolean | null
          metadata?: Json | null
          notes?: string | null
          org_id?: string | null
          payment_terms?: string | null
          phone?: string | null
          pricing_tier?: string | null
          state?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          vendor_type?: string | null
          website?: string | null
          years_in_business?: number | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          certifications?: string | null
          certifications_expiry?: string | null
          city?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_provider?: string | null
          is_deleted?: boolean
          is_preferred?: boolean | null
          metadata?: Json | null
          notes?: string | null
          org_id?: string | null
          payment_terms?: string | null
          phone?: string | null
          pricing_tier?: string | null
          state?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          vendor_type?: string | null
          website?: string | null
          years_in_business?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warranties: {
        Row: {
          component_description: string | null
          coverage_percentage: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          document_path: string | null
          exclusions: string | null
          expiration_date: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          start_date: string | null
          updated_at: string | null
          vendor_contact: string | null
          vendor_email: string | null
          vendor_name: string | null
          vendor_phone: string | null
          warranty_term_years: number | null
          warranty_type: string | null
        }
        Insert: {
          component_description?: string | null
          coverage_percentage?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          document_path?: string | null
          exclusions?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean
          metadata?: Json | null
          notes?: string | null
          project_id: string
          project_name?: string | null
          start_date?: string | null
          updated_at?: string | null
          vendor_contact?: string | null
          vendor_email?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
          warranty_term_years?: number | null
          warranty_type?: string | null
        }
        Update: {
          component_description?: string | null
          coverage_percentage?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          document_path?: string | null
          exclusions?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean
          metadata?: Json | null
          notes?: string | null
          project_id?: string
          project_name?: string | null
          start_date?: string | null
          updated_at?: string | null
          vendor_contact?: string | null
          vendor_email?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
          warranty_term_years?: number | null
          warranty_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warranties_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_packages: {
        Row: {
          area: string | null
          budget_hour_item_id: string | null
          created_at: string | null
          created_by: string | null
          crew: string | null
          deleted_at: string | null
          description: string | null
          drawing_ids: string[] | null
          drawing_set_ids: string[]
          field_hours_actual: number | null
          field_hours_budget: number | null
          gc_drawing_ids: string[]
          id: string
          install_phase: string | null
          is_deleted: boolean
          linked_drawing_ids: string | null
          linked_rfi_ids: string | null
          load_list_complete: boolean | null
          metadata: Json | null
          name: string | null
          notes: string | null
          percent_complete: number | null
          phase: string | null
          project_id: string
          project_name: string | null
          released_date: string | null
          rfi_ids: string[] | null
          scheduled_end_date: string | null
          scheduled_start_date: string | null
          sequence_confirmed: boolean | null
          sequence_number: string | null
          shipping_phase: string | null
          shop_hours_actual: number | null
          shop_hours_budget: number | null
          status: string
          tonnage: number | null
          trade_phase: string | null
          updated_at: string | null
          vif_confirmed: boolean | null
          vif_confirmed_by: string | null
          vif_confirmed_date: string | null
          wp_number: string | null
        }
        Insert: {
          area?: string | null
          budget_hour_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          crew?: string | null
          deleted_at?: string | null
          description?: string | null
          drawing_ids?: string[] | null
          drawing_set_ids?: string[]
          field_hours_actual?: number | null
          field_hours_budget?: number | null
          gc_drawing_ids?: string[]
          id?: string
          install_phase?: string | null
          is_deleted?: boolean
          linked_drawing_ids?: string | null
          linked_rfi_ids?: string | null
          load_list_complete?: boolean | null
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          percent_complete?: number | null
          phase?: string | null
          project_id: string
          project_name?: string | null
          released_date?: string | null
          rfi_ids?: string[] | null
          scheduled_end_date?: string | null
          scheduled_start_date?: string | null
          sequence_confirmed?: boolean | null
          sequence_number?: string | null
          shipping_phase?: string | null
          shop_hours_actual?: number | null
          shop_hours_budget?: number | null
          status?: string
          tonnage?: number | null
          trade_phase?: string | null
          updated_at?: string | null
          vif_confirmed?: boolean | null
          vif_confirmed_by?: string | null
          vif_confirmed_date?: string | null
          wp_number?: string | null
        }
        Update: {
          area?: string | null
          budget_hour_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          crew?: string | null
          deleted_at?: string | null
          description?: string | null
          drawing_ids?: string[] | null
          drawing_set_ids?: string[]
          field_hours_actual?: number | null
          field_hours_budget?: number | null
          gc_drawing_ids?: string[]
          id?: string
          install_phase?: string | null
          is_deleted?: boolean
          linked_drawing_ids?: string | null
          linked_rfi_ids?: string | null
          load_list_complete?: boolean | null
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          percent_complete?: number | null
          phase?: string | null
          project_id?: string
          project_name?: string | null
          released_date?: string | null
          rfi_ids?: string[] | null
          scheduled_end_date?: string | null
          scheduled_start_date?: string | null
          sequence_confirmed?: boolean | null
          sequence_number?: string | null
          shipping_phase?: string | null
          shop_hours_actual?: number | null
          shop_hours_budget?: number | null
          status?: string
          tonnage?: number | null
          trade_phase?: string | null
          updated_at?: string | null
          vif_confirmed?: boolean | null
          vif_confirmed_by?: string | null
          vif_confirmed_date?: string | null
          wp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_packages_budget_hour_item_id_fkey"
            columns: ["budget_hour_item_id"]
            isOneToOne: false
            referencedRelation: "budget_hour_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      drawing_register_view: {
        Row: {
          active_hold_id: string | null
          active_hold_placed_at: string | null
          active_hold_reason: string | null
          current_issued_at: string | null
          current_revision: string | null
          current_revision_id: string | null
          current_status: string | null
          discipline: string | null
          drawing_id: string | null
          drawing_set_name: string | null
          last_activity: string | null
          open_impact_count: number | null
          pending_review_count: number | null
          project_id: string | null
          rfi_count: number | null
          sheet_number: string | null
          sheet_title: string | null
          stage: string | null
          work_package_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drawings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _tmp_timeout_probe: { Args: never; Returns: string }
      accept_invitation: { Args: { p_token: string }; Returns: Json }
      acknowledge_transmittal: {
        Args: {
          p_at?: string
          p_by_name: string
          p_notes?: string
          p_transmittal_id: string
        }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by_name: string | null
          acknowledged_notes: string | null
          created_at: string
          created_by: string | null
          date_received: string | null
          date_sent: string | null
          deleted_at: string | null
          direction: string
          id: string
          is_deleted: boolean
          metadata: Json
          notes: string | null
          project_id: string
          purpose: string | null
          received_from: string | null
          recipient_company: string | null
          recipient_email: string | null
          sent_by: string | null
          sent_by_name: string | null
          sent_to: string | null
          source_company: string | null
          status: string
          subject: string | null
          submittal_id: string | null
          submittal_round_id: string | null
          transmittal_number: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "drawing_transmittals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      action_item_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      actor_display_name: { Args: never; Returns: string }
      add_tm_ticket: {
        Args: { p_backcharge_id: string; p_payload: Json }
        Returns: {
          amount: number
          attachments: Json
          backcharge_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          equipment_cost: number
          id: string
          is_deleted: boolean
          labor_hours: number
          labor_rate: number
          markup_percent: number
          material_cost: number
          project_id: string
          signed_by: string | null
          sort_order: number | null
          ticket_date: string | null
          ticket_number: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "backcharge_tm_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_updated_at_trigger:
        | {
            Args: { tbl: unknown }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.add_updated_at_trigger(tbl => text), public.add_updated_at_trigger(tbl => regclass). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { tbl: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.add_updated_at_trigger(tbl => text), public.add_updated_at_trigger(tbl => regclass). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      advance_piece_station: {
        Args: {
          p_override?: boolean
          p_override_reason?: string
          p_piece_id: string
          p_project_id: string
          p_station_key: string
        }
        Returns: Json
      }
      advance_piece_station_impl: {
        Args: {
          p_override?: boolean
          p_override_reason?: string
          p_piece_id: string
          p_project_id: string
          p_station_key: string
        }
        Returns: Json
      }
      advance_piece_stations: {
        Args: {
          p_override?: boolean
          p_override_reason?: string
          p_piece_ids: string[]
          p_project_id: string
          p_station_key?: string
        }
        Returns: Json
      }
      advance_piece_stations_impl: {
        Args: {
          p_override?: boolean
          p_override_reason?: string
          p_piece_ids: string[]
          p_project_id: string
          p_station_key?: string
        }
        Returns: Json
      }
      answer_rfi: {
        Args: {
          p_answer: string
          p_answered_by?: string
          p_date_answered?: string
          p_release_holds?: boolean
          p_release_notes?: string
          p_rfi_id: string
        }
        Returns: {
          answer: string | null
          answered_by: string | null
          answered_by_id: string | null
          area_sequence: string | null
          assigned_to: string | null
          ball_in_court: string | null
          closed_at: string | null
          closed_by: string | null
          cost_code_id: string | null
          cost_impact: boolean | null
          cost_impact_amount: number | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          date_answered: string | null
          date_required: string | null
          deleted_at: string | null
          description: string | null
          discipline: string | null
          distribution_list: string | null
          drawing_id: string | null
          drawing_reference: string | null
          drawing_set_id: string | null
          due_date: string | null
          gc_drawing_id: string | null
          holds_released_count: number
          id: string
          impacts_activity_ids: string[] | null
          internal_notes: string | null
          is_deleted: boolean
          metadata: Json | null
          priority: string
          project_id: string
          project_name: string | null
          question: string | null
          responded_date: string | null
          response_text: string | null
          rfi_number: string | null
          schedule_impact: boolean | null
          schedule_impact_days: number | null
          spec_section: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_piece_import_batch: { Args: { p_batch_id: string }; Returns: Json }
      apply_planner_offline_operation: {
        Args: {
          p_client_op_id: string
          p_entity_id: string
          p_expected_updated_at: string
          p_kind: string
          p_patch: Json
          p_project_id: string
        }
        Returns: Json
      }
      apply_project_template: {
        Args: { p_project_id: string; p_template_key?: string }
        Returns: Json
      }
      apply_schedule_changes: {
        Args: { p_changes: Json; p_project_id: string }
        Returns: {
          actual_finish_date: string | null
          actual_start_date: string | null
          assigned_to: string | null
          blockers: Json | null
          created_at: string | null
          created_by: string | null
          crew_id: string | null
          crew_name: string | null
          deleted_at: string | null
          dependencies: string | null
          duration: number | null
          end_date: string | null
          id: string
          is_deleted: boolean
          is_milestone: boolean | null
          is_summary: boolean
          metadata: Json | null
          milestone: boolean | null
          notes: string | null
          outline_level: number | null
          parent_task_id: string | null
          percent_complete: number | null
          phase: string | null
          priority: string | null
          project_id: string
          project_name: string | null
          related_action_item_ids: Json | null
          related_change_order_ids: Json | null
          related_rfi_ids: Json | null
          resource_names: string | null
          sort_order: number | null
          start_date: string | null
          status: string
          target_release: string | null
          task_name: string | null
          task_type: string | null
          updated_at: string | null
          wbs_code: string | null
          work_package_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "schedule_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      approve_change_order: {
        Args: {
          p_approved_by: string
          p_approved_date?: string
          p_id: string
          p_sov_line_item_id?: string
          p_sov_mode?: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          approved_date: string | null
          attachments: string | null
          change_request_id: string | null
          co_amount: number | null
          co_number: string | null
          cost_code_id: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          margin_percent: number | null
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          reason_code: string | null
          schedule_impact_days: number | null
          source_rfi_id: string | null
          sov_applied_at: string | null
          sov_line_item_id: string | null
          sov_line_number: number | null
          sov_mode: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "change_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_piece_import_batch: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      archive_note_folder: {
        Args: {
          p_expected_version: number
          p_folder_id: string
          p_idempotency_key?: string
          p_reason?: string
        }
        Returns: Json
      }
      archive_piece_lots: {
        Args: {
          p_confirmation: string
          p_piece_ids: string[]
          p_project_id: string
          p_reason: string
        }
        Returns: Json
      }
      assign_pieces_to_work_package: {
        Args: {
          p_piece_ids: string[]
          p_project_id: string
          p_work_package_id: string
        }
        Returns: Json
      }
      attach_revision_to_submittal_round: {
        Args: {
          p_drawing_id: string
          p_revision_id: string
          p_submittal_id: string
        }
        Returns: {
          ball_in_court: string | null
          created_at: string
          deleted_at: string | null
          drawing_set_ids: string[]
          file_url: string | null
          id: string
          is_deleted: boolean
          markup_file_url: string | null
          metadata: Json
          project_id: string
          response_notes: string | null
          returned_date: string | null
          reviewer: string | null
          round_number: number
          status: string
          submittal_id: string
          submitted_by: string | null
          submitted_date: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "submittal_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backcharge_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      billing_plans_available: { Args: never; Returns: Json }
      build_pay_application_lines: {
        Args: { p_app: Database["public"]["Tables"]["pay_applications"]["Row"] }
        Returns: number
      }
      build_revision_impact_report: {
        Args: { p_drawing_set_id: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          drawing_set_id: string | null
          generated_at: string
          generated_by: string | null
          high_risk_count: number
          id: string
          impact_level: string
          is_deleted: boolean
          likely_rfi: boolean
          project_id: string
          set_name: string | null
          sheets_changed: number
          summary: Json
        }
        SetofOptions: {
          from: "*"
          to: "drawing_revision_summaries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bulk_update_piece_attributes: {
        Args: { p_patch: Json; p_piece_ids: string[]; p_project_id: string }
        Returns: Json
      }
      bulk_update_piece_attributes_impl: {
        Args: { p_patch: Json; p_piece_ids: string[]; p_project_id: string }
        Returns: Json
      }
      change_order_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      close_punchlist_item: {
        Args: { p_item_id: string; p_notes?: string; p_photo_id: string }
        Returns: {
          assigned_to: string | null
          category: string | null
          client_op_id: string | null
          closed_at: string | null
          closed_by: string | null
          closing_photo_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          drawing_id: string | null
          id: string
          inspection_id: string | null
          is_deleted: boolean
          location: string | null
          metadata: Json | null
          notes: string | null
          percent_complete: number | null
          phase: string | null
          photos: Json | null
          priority: string
          project_id: string
          project_name: string | null
          status: string
          target_completion_date: string | null
          updated_at: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "punchlist_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_rfi: {
        Args: { p_notes?: string; p_rfi_id: string }
        Returns: {
          answer: string | null
          answered_by: string | null
          answered_by_id: string | null
          area_sequence: string | null
          assigned_to: string | null
          ball_in_court: string | null
          closed_at: string | null
          closed_by: string | null
          cost_code_id: string | null
          cost_impact: boolean | null
          cost_impact_amount: number | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          date_answered: string | null
          date_required: string | null
          deleted_at: string | null
          description: string | null
          discipline: string | null
          distribution_list: string | null
          drawing_id: string | null
          drawing_reference: string | null
          drawing_set_id: string | null
          due_date: string | null
          gc_drawing_id: string | null
          holds_released_count: number
          id: string
          impacts_activity_ids: string[] | null
          internal_notes: string | null
          is_deleted: boolean
          metadata: Json | null
          priority: string
          project_id: string
          project_name: string | null
          question: string | null
          responded_date: string | null
          response_text: string | null
          rfi_number: string | null
          schedule_impact: boolean | null
          schedule_impact_days: number | null
          spec_section: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_project_closeout: {
        Args: {
          p_notes?: string
          p_override_reason?: string
          p_project_id: string
        }
        Returns: {
          as_built_complete: boolean | null
          blockers_at_completion: Json | null
          certificate_of_occupancy: string | null
          checklist: Json | null
          closeout_date: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          final_completion_date: string | null
          final_inspection_date: string | null
          id: string
          is_deleted: boolean
          manuals_complete: boolean | null
          metadata: Json | null
          notes: string | null
          override_by: string | null
          override_reason: string | null
          project_id: string
          project_name: string | null
          punchlist_complete: boolean | null
          reopen_reason: string | null
          status: string | null
          substantial_completion_date: string | null
          updated_at: string | null
          warranties_complete: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "project_closeout"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_staging_e2e_bootstrap: {
        Args: { p_org_id: string; p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      consume_desktop_session_handoff: {
        Args: { p_code_challenge: string; p_code_hash: string }
        Returns: {
          encrypted_session: Json
          state: string
        }[]
      }
      convert_change_request: {
        Args: { p_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          approved_date: string | null
          attachments: string | null
          change_request_id: string | null
          co_amount: number | null
          co_number: string | null
          cost_code_id: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          margin_percent: number | null
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          reason_code: string | null
          schedule_impact_days: number | null
          source_rfi_id: string | null
          sov_applied_at: string | null
          sov_line_item_id: string | null
          sov_line_number: number | null
          sov_mode: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "change_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_backcharge: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          attachments: Json
          backcharge_number: string | null
          collected_amount: number | null
          collected_at: string | null
          cost_code_id: string | null
          created_at: string
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          id: string
          incident_date: string | null
          is_deleted: boolean
          linked_co_id: string | null
          metadata: Json
          notes: string | null
          notice_date: string | null
          project_id: string
          reason_code: string | null
          responsible_party: string | null
          responsible_party_type: string | null
          source_rfi_id: string | null
          status: string
          ticket_total: number
          title: string
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "backcharges"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_change_order: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          approved_date: string | null
          attachments: string | null
          change_request_id: string | null
          co_amount: number | null
          co_number: string | null
          cost_code_id: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          margin_percent: number | null
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          reason_code: string | null
          schedule_impact_days: number | null
          source_rfi_id: string | null
          sov_applied_at: string | null
          sov_line_item_id: string | null
          sov_line_number: number | null
          sov_mode: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "change_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_change_request: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          affected_areas: string | null
          change_order_id: string | null
          cr_number: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          estimated_cost_impact: number | null
          estimated_schedule_impact_days: number | null
          id: string
          is_deleted: boolean
          metadata: Json | null
          priority: string
          project_id: string
          project_name: string | null
          reason: string | null
          request_date: string | null
          requested_by: string | null
          scope_impact: string | null
          status: string
          title: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_delivery: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          actual_date: string | null
          area: string | null
          capacity_lbs: number | null
          carrier: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delivery_number: string | null
          delivery_title: string | null
          delivery_type: string | null
          description: string | null
          expected_ship_date: string | null
          id: string
          impacts_activity_ids: string[] | null
          inspection_required: boolean | null
          is_deleted: boolean
          is_long_lead: boolean | null
          lead_time_weeks: number | null
          load_category: string | null
          load_number: string | null
          metadata: Json | null
          notes: string | null
          order_placed_date: string | null
          pieces: number | null
          pieces_advanced_count: number
          po_number: string | null
          priority: string
          procurement_category: string | null
          project_id: string
          project_name: string | null
          received_at: string | null
          received_by: string | null
          received_notes: string | null
          receiving_location: string | null
          required_date: string | null
          scheduled_date: string | null
          sequence_number: string | null
          shipping_ticket_name: string | null
          shipping_ticket_path: string | null
          shipping_ticket_url: string | null
          special_instructions: string | null
          status: string
          tracking_number: string | null
          updated_at: string | null
          vendor: string | null
          weight_tons: number | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "deliveries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_desktop_session_handoff: {
        Args: {
          p_code_challenge: string
          p_code_hash: string
          p_created_at: string
          p_encrypted_session: Json
          p_expires_at: string
          p_state: string
          p_user_id: string
        }
        Returns: string
      }
      create_expense: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          amount: number | null
          approved_by: string | null
          approved_date: string | null
          cost_code: string | null
          cost_code_id: string | null
          cost_code_name: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          expense_date: string | null
          expense_number: string | null
          expense_type: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          is_deleted: boolean
          metadata: Json | null
          notes: string | null
          paid_by: string | null
          payment_date: string | null
          payment_status: string | null
          project_id: string
          project_name: string | null
          quantity: number | null
          receipt_path: string | null
          receipt_url: string | null
          sov_line_item_id: string | null
          sov_line_item_name: string | null
          submitted_by: string | null
          submitted_date: string | null
          tags: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string | null
          vendor: string | null
          vendor_id: string | null
          void_reason: string | null
          work_package_id: string | null
          work_package_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_inspection: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          completed_at: string | null
          corrective_actions: string | null
          created_at: string | null
          created_by: string | null
          deficiencies_count: number | null
          deleted_at: string | null
          description: string | null
          drawing_id: string | null
          findings: string | null
          id: string
          inspection_date: string | null
          inspection_number: string | null
          inspection_type: string | null
          inspector_name: string | null
          inspector_role: string | null
          is_deleted: boolean
          location: string | null
          metadata: Json | null
          notes: string | null
          phase: string | null
          project_id: string
          project_name: string | null
          sign_off_status: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          status: string
          updated_at: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "inspections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_material_requirement: {
        Args: {
          p_description?: string
          p_external_ref?: string
          p_material_grade?: string
          p_profile?: string
          p_project_id: string
          p_quantity_required?: number
          p_requirement_code: string
          p_source_system?: string
          p_unit?: string
        }
        Returns: Json
      }
      create_note_folder: {
        Args: {
          p_idempotency_key?: string
          p_name: string
          p_org_id: string
          p_parent_folder_id?: string
        }
        Returns: Json
      }
      create_organization: {
        Args: { p_name: string; p_slug?: string }
        Returns: Json
      }
      create_project: { Args: { project_data: Json }; Returns: Json }
      create_qc_record: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          acceptance_criteria: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          inspection_id: string | null
          is_deleted: boolean
          location: string | null
          material_or_component: string | null
          metadata: Json | null
          notes: string | null
          piece_id: string | null
          project_id: string
          project_name: string | null
          quantity_passed: number | null
          quantity_tested: number | null
          record_number: string | null
          result: string | null
          specification: string | null
          status: string | null
          test_date: string | null
          test_lab_or_inspector: string | null
          test_type: string | null
          test_value: string | null
          updated_at: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quality_control_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_revision_comparison: {
        Args: {
          p_drawing_id: string
          p_from_revision_id: string
          p_to_revision_id: string
        }
        Returns: {
          ai_summary: string | null
          compare_status: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delta_count: number | null
          deterministic_stats: Json | null
          drawing_id: string | null
          error_message: string | null
          from_analysis_id: string | null
          from_revision_id: string | null
          id: string
          is_deleted: boolean
          metadata: Json | null
          model: string | null
          project_id: string | null
          raw_ai_response: Json | null
          requested_by: string | null
          source: string
          to_analysis_id: string | null
          to_revision_id: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "drawing_revision_comparisons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_rfi: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          answer: string | null
          answered_by: string | null
          answered_by_id: string | null
          area_sequence: string | null
          assigned_to: string | null
          ball_in_court: string | null
          closed_at: string | null
          closed_by: string | null
          cost_code_id: string | null
          cost_impact: boolean | null
          cost_impact_amount: number | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          date_answered: string | null
          date_required: string | null
          deleted_at: string | null
          description: string | null
          discipline: string | null
          distribution_list: string | null
          drawing_id: string | null
          drawing_reference: string | null
          drawing_set_id: string | null
          due_date: string | null
          gc_drawing_id: string | null
          holds_released_count: number
          id: string
          impacts_activity_ids: string[] | null
          internal_notes: string | null
          is_deleted: boolean
          metadata: Json | null
          priority: string
          project_id: string
          project_name: string | null
          question: string | null
          responded_date: string | null
          response_text: string | null
          rfi_number: string | null
          schedule_impact: boolean | null
          schedule_impact_days: number | null
          spec_section: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_rfi_from_delta: {
        Args: { p_delta_id: string; p_payload: Json }
        Returns: {
          answer: string | null
          answered_by: string | null
          answered_by_id: string | null
          area_sequence: string | null
          assigned_to: string | null
          ball_in_court: string | null
          closed_at: string | null
          closed_by: string | null
          cost_code_id: string | null
          cost_impact: boolean | null
          cost_impact_amount: number | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          date_answered: string | null
          date_required: string | null
          deleted_at: string | null
          description: string | null
          discipline: string | null
          distribution_list: string | null
          drawing_id: string | null
          drawing_reference: string | null
          drawing_set_id: string | null
          due_date: string | null
          gc_drawing_id: string | null
          holds_released_count: number
          id: string
          impacts_activity_ids: string[] | null
          internal_notes: string | null
          is_deleted: boolean
          metadata: Json | null
          priority: string
          project_id: string
          project_name: string | null
          question: string | null
          responded_date: string | null
          response_text: string | null
          rfi_number: string | null
          schedule_impact: boolean | null
          schedule_impact_days: number | null
          spec_section: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_safety_incident: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          action_due_date: string | null
          closed_at: string | null
          closed_by: string | null
          corrective_actions: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          incident_date: string | null
          incident_number: string | null
          incident_time: string | null
          incident_type: string | null
          injuries: string | null
          investigation_completed: boolean | null
          is_deleted: boolean
          location: string | null
          metadata: Json | null
          notes: string | null
          phase: string | null
          project_id: string
          project_name: string | null
          reported_by: string | null
          responsible_party: string | null
          root_cause: string | null
          safety_trained: boolean | null
          severity: string
          status: string
          updated_at: string | null
          witnesses: string | null
        }
        SetofOptions: {
          from: "*"
          to: "safety_incidents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_sov_item: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          application_number: number | null
          change_order_id: string | null
          cost_code: string | null
          cost_code_id: string | null
          cost_code_name: string | null
          created_at: string | null
          created_by: string | null
          current_percent_complete: number | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          line_item_number: number | null
          metadata: Json | null
          payment_received_date: string | null
          period_from: string | null
          period_to: string | null
          previous_percent_complete: number | null
          project_id: string
          project_name: string | null
          retainage_percent: number | null
          scheduled_value: number | null
          sort_order: number | null
          sov_id: string | null
          status: string | null
          submitted_date: string | null
          updated_at: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sov_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_submittal: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          approval_chain: Json | null
          approval_chain_step: number | null
          approved_date: string | null
          approver_notes: Json
          ball_in_court: string | null
          created_at: string | null
          current_round_id: string | null
          days_in_review: number | null
          deleted_at: string | null
          derived_stage: string | null
          discipline: string | null
          distributed_to: string | null
          drawing_set_ids: string[] | null
          external_id: string | null
          external_source: string | null
          fab_release_override_reason: string | null
          file_url: string | null
          gate_override_at: string | null
          gate_override_by: string | null
          gate_override_reason: string | null
          id: string
          is_deleted: boolean | null
          linked_rfi_ids: string[] | null
          linked_task_ids: string[] | null
          metadata: Json | null
          notes: string | null
          parent_submittal_id: string | null
          project_id: string
          project_name: string | null
          received_from: string | null
          required_date: string | null
          returned_date: string | null
          reviewer: string | null
          revision: string | null
          round_number: number | null
          spec_section: string | null
          split_reason: string | null
          stage_entered_at: string | null
          status: string
          submittal_number: string
          submittal_type: string | null
          submitted_by: string | null
          submitted_date: string | null
          title: string
          total_rounds: number
          transmittal_number: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "submittals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_transmittal: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by_name: string | null
          acknowledged_notes: string | null
          created_at: string
          created_by: string | null
          date_received: string | null
          date_sent: string | null
          deleted_at: string | null
          direction: string
          id: string
          is_deleted: boolean
          metadata: Json
          notes: string | null
          project_id: string
          purpose: string | null
          received_from: string | null
          recipient_company: string | null
          recipient_email: string | null
          sent_by: string | null
          sent_by_name: string | null
          sent_to: string | null
          source_company: string | null
          status: string
          subject: string | null
          submittal_id: string | null
          submittal_round_id: string | null
          transmittal_number: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "drawing_transmittals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_work_package: {
        Args: { p_payload: Json; p_project_id: string }
        Returns: {
          area: string | null
          budget_hour_item_id: string | null
          created_at: string | null
          created_by: string | null
          crew: string | null
          deleted_at: string | null
          description: string | null
          drawing_ids: string[] | null
          drawing_set_ids: string[]
          field_hours_actual: number | null
          field_hours_budget: number | null
          gc_drawing_ids: string[]
          id: string
          install_phase: string | null
          is_deleted: boolean
          linked_drawing_ids: string | null
          linked_rfi_ids: string | null
          load_list_complete: boolean | null
          metadata: Json | null
          name: string | null
          notes: string | null
          percent_complete: number | null
          phase: string | null
          project_id: string
          project_name: string | null
          released_date: string | null
          rfi_ids: string[] | null
          scheduled_end_date: string | null
          scheduled_start_date: string | null
          sequence_confirmed: boolean | null
          sequence_number: string | null
          shipping_phase: string | null
          shop_hours_actual: number | null
          shop_hours_budget: number | null
          status: string
          tonnage: number | null
          trade_phase: string | null
          updated_at: string | null
          vif_confirmed: boolean | null
          vif_confirmed_by: string | null
          vif_confirmed_date: string | null
          wp_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_packages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_drawing_set: { Args: { p_set_id: string }; Returns: number }
      deliver_piece_lots: {
        Args: {
          p_piece_ids: string[]
          p_project_id: string
          p_reference_data?: Json
        }
        Returns: Json
      }
      deliver_piece_lots_impl: {
        Args: {
          p_piece_ids: string[]
          p_project_id: string
          p_reference_data?: Json
        }
        Returns: Json
      }
      document_folder_has_cycle: {
        Args: { p_folder_id: string; p_parent_id: string }
        Returns: boolean
      }
      ensure_general_notes_folder: {
        Args: { p_org_id: string }
        Returns: string
      }
      ensure_project_closeout: {
        Args: { p_project_id: string }
        Returns: {
          as_built_complete: boolean | null
          blockers_at_completion: Json | null
          certificate_of_occupancy: string | null
          checklist: Json | null
          closeout_date: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          final_completion_date: string | null
          final_inspection_date: string | null
          id: string
          is_deleted: boolean
          manuals_complete: boolean | null
          metadata: Json | null
          notes: string | null
          override_by: string | null
          override_reason: string | null
          project_id: string
          project_name: string | null
          punchlist_complete: boolean | null
          reopen_reason: string | null
          status: string | null
          substantial_completion_date: string | null
          updated_at: string | null
          warranties_complete: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "project_closeout"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erase_my_account: { Args: { p_confirm_email: string }; Returns: Json }
      erasure_toggle_user_triggers: {
        Args: { p_disable: boolean; p_list?: string[]; p_tables: string[] }
        Returns: string[]
      }
      erect_piece_lots: {
        Args: {
          p_piece_ids: string[]
          p_project_id: string
          p_reference_data?: Json
        }
        Returns: Json
      }
      erect_piece_lots_impl: {
        Args: {
          p_piece_ids: string[]
          p_project_id: string
          p_reference_data?: Json
        }
        Returns: Json
      }
      escalate_rfi_sla: { Args: never; Returns: number }
      evaluate_fab_release_package: {
        Args: { p_drawing_ids: string[] }
        Returns: {
          kind: string
          rfi_numbers: string[]
          sheet_numbers: string[]
          title: string
        }[]
      }
      evaluate_fab_release_set: {
        Args: { p_drawing_set_id: string; p_project_id: string }
        Returns: Json
      }
      evaluate_project_closeout: {
        Args: { p_project_id: string }
        Returns: Json
      }
      evaluate_release_gate: {
        Args: { p_work_package_id: string }
        Returns: Json
      }
      expense_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      fab_release_blocking_rfis: {
        Args: { p_drawing_ids: string[] }
        Returns: {
          id: string
          project_id: string
          rfi_number: string
          status: string
          title: string
        }[]
      }
      feature_flag_enabled_for: {
        Args: { p_email: string; p_key: string }
        Returns: boolean
      }
      field_sync_op: {
        Args: {
          p_client_op_id: string
          p_kind: string
          p_payload: Json
          p_project_id: string
        }
        Returns: Json
      }
      founding_org_id: { Args: never; Returns: string }
      generate_operational_alerts: {
        Args: { p_project_id?: string }
        Returns: number
      }
      generate_pay_application: {
        Args: {
          p_notes?: string
          p_period_from: string
          p_period_to: string
          p_project_id: string
        }
        Returns: {
          application_label: string | null
          application_number: number
          approved_by: string | null
          balance_to_finish: number
          certified_date: string | null
          created_at: string
          created_by: string | null
          current_payment_due: number
          deleted_at: string | null
          id: string
          is_deleted: boolean
          less_previous_certificates: number
          metadata: Json
          net_change_orders: number
          notes: string | null
          original_contract_sum: number
          paid_date: string | null
          period_from: string | null
          period_to: string | null
          project_id: string
          retainage_percent: number
          sov_reconciles: boolean | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          total_completed_stored: number
          total_earned_less_retainage: number
          total_retainage: number
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pay_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_project_alerts: {
        Args: { p_project_id: string }
        Returns: number
      }
      get_invitation: { Args: { p_token: string }; Returns: Json }
      get_llm_usage_window: {
        Args: { p_since: string; p_user_id: string }
        Returns: {
          cost_sum: number
          request_count: number
        }[]
      }
      get_maintenance_job_context: {
        Args: { p_job_key: string }
        Returns: {
          completed_at: string
          expected_project_ref: string
          founding_org_id: string
          token_sha256: string
        }[]
      }
      get_my_project_role: { Args: { p_project_id: string }; Returns: string }
      get_next_sequence_number: {
        Args: { p_project_id: string; p_record_type: string }
        Returns: number
      }
      hard_delete_allowlist: { Args: never; Returns: string[] }
      hard_delete_merge_counts: { Args: { a: Json; b: Json }; Returns: Json }
      hard_delete_organization: {
        Args: { p_org_id: string; p_reason: string }
        Returns: Json
      }
      hard_delete_project: {
        Args: { p_project_id: string; p_reason: string }
        Returns: Json
      }
      hard_delete_record: {
        Args: { p_id: string; p_reason?: string; p_table: string }
        Returns: Json
      }
      hard_delete_records: {
        Args: { p_ids: string[]; p_reason?: string; p_table: string }
        Returns: Json
      }
      hard_delete_release_dependents: {
        Args: { p_depth?: number; p_ids: string[]; p_table: string }
        Returns: Json
      }
      hard_delete_toggle_triggers: {
        Args: {
          p_before_only?: boolean
          p_disable: boolean
          p_list?: string[]
          p_tables: string[]
        }
        Returns: string[]
      }
      import_model_elements: {
        Args: { p_model_id: string; p_rows: Json }
        Returns: Json
      }
      link_model_elements_to_pieces: {
        Args: { p_project_id: string }
        Returns: Json
      }
      link_model_elements_to_pieces_page: {
        Args: { p_after_id?: string; p_limit?: number; p_project_id: string }
        Returns: Json
      }
      link_piece_drawing: {
        Args: { p_drawing_id: string; p_piece_id: string; p_project_id: string }
        Returns: Json
      }
      link_piece_drawing_set: {
        Args: {
          p_drawing_set_id: string
          p_piece_id: string
          p_project_id: string
        }
        Returns: Json
      }
      link_unlinked_model_elements_for_piece: {
        Args: { p_piece_id: string }
        Returns: number
      }
      list_drawing_impact_assignees: {
        Args: { p_project_id: string }
        Returns: {
          display_name: string
          project_role: string
          user_id: string
        }[]
      }
      list_visible_note_folders: {
        Args: { p_include_archived?: boolean; p_org_id: string }
        Returns: Json
      }
      log_backcharge_event: {
        Args: {
          p_backcharge_id: string
          p_detail: string
          p_event_type: string
          p_from: string
          p_to: string
        }
        Returns: undefined
      }
      log_submittal_event: {
        Args: {
          p_event: string
          p_from: string
          p_meta?: Json
          p_project_id: string
          p_submittal_id: string
          p_to: string
        }
        Returns: undefined
      }
      log_transmittal_event: {
        Args: {
          p_event: string
          p_from: string
          p_metadata?: Json
          p_project_id: string
          p_reason?: string
          p_to: string
          p_transmittal_id: string
        }
        Returns: undefined
      }
      map_material_requirement_to_pieces: {
        Args: {
          p_material_requirement_id: string
          p_piece_ids: string[]
          p_project_id: string
        }
        Returns: Json
      }
      meeting_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      model_fab_rollup: { Args: { p_model_id: string }; Returns: Json }
      move_backcharge: {
        Args: {
          p_actor?: string
          p_collected_amount?: number
          p_date?: string
          p_id: string
          p_notes?: string
          p_status: string
        }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          attachments: Json
          backcharge_number: string | null
          collected_amount: number | null
          collected_at: string | null
          cost_code_id: string | null
          created_at: string
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          id: string
          incident_date: string | null
          is_deleted: boolean
          linked_co_id: string | null
          metadata: Json
          notes: string | null
          notice_date: string | null
          project_id: string
          reason_code: string | null
          responsible_party: string | null
          responsible_party_type: string | null
          source_rfi_id: string | null
          status: string
          ticket_total: number
          title: string
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "backcharges"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_change_order: {
        Args: { p_id: string; p_notes?: string; p_status: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          approved_date: string | null
          attachments: string | null
          change_request_id: string | null
          co_amount: number | null
          co_number: string | null
          cost_code_id: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean
          margin_percent: number | null
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          reason_code: string | null
          schedule_impact_days: number | null
          source_rfi_id: string | null
          sov_applied_at: string | null
          sov_line_item_id: string | null
          sov_line_number: number | null
          sov_mode: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "change_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_expense: {
        Args: {
          p_actor?: string
          p_date?: string
          p_id: string
          p_notes?: string
          p_status: string
        }
        Returns: {
          amount: number | null
          approved_by: string | null
          approved_date: string | null
          cost_code: string | null
          cost_code_id: string | null
          cost_code_name: string | null
          created_at: string | null
          created_by: string | null
          decision_notes: string | null
          deleted_at: string | null
          description: string | null
          expense_date: string | null
          expense_number: string | null
          expense_type: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          is_deleted: boolean
          metadata: Json | null
          notes: string | null
          paid_by: string | null
          payment_date: string | null
          payment_status: string | null
          project_id: string
          project_name: string | null
          quantity: number | null
          receipt_path: string | null
          receipt_url: string | null
          sov_line_item_id: string | null
          sov_line_item_name: string | null
          submitted_by: string | null
          submitted_date: string | null
          tags: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string | null
          vendor: string | null
          vendor_id: string | null
          void_reason: string | null
          work_package_id: string | null
          work_package_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_note_folder: {
        Args: {
          p_expected_version: number
          p_folder_id: string
          p_idempotency_key?: string
          p_parent_folder_id: string
        }
        Returns: Json
      }
      move_pay_application: {
        Args: {
          p_actor?: string
          p_date?: string
          p_id: string
          p_notes?: string
          p_status: string
        }
        Returns: {
          application_label: string | null
          application_number: number
          approved_by: string | null
          balance_to_finish: number
          certified_date: string | null
          created_at: string
          created_by: string | null
          current_payment_due: number
          deleted_at: string | null
          id: string
          is_deleted: boolean
          less_previous_certificates: number
          metadata: Json
          net_change_orders: number
          notes: string | null
          original_contract_sum: number
          paid_date: string | null
          period_from: string | null
          period_to: string | null
          project_id: string
          retainage_percent: number
          sov_reconciles: boolean | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          total_completed_stored: number
          total_earned_less_retainage: number
          total_retainage: number
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pay_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_risk: {
        Args: { p_id: string; p_notes?: string; p_status: string }
        Returns: {
          category: string | null
          closed_date: string | null
          contingency_plan: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          identified_date: string | null
          impact: number
          is_deleted: boolean | null
          metadata: Json | null
          mitigation_plan: string | null
          notes: string | null
          owner: string | null
          probability: number
          project_id: string
          risk_number: string | null
          score: number | null
          severity: string | null
          status: string
          target_close_date: string | null
          title: string
          trigger_event: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "risks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      note_backcharge: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      note_folder_effective_project_ids: {
        Args: { p_folder_id: string }
        Returns: string[]
      }
      note_folder_receipt_get: { Args: { p_key: string }; Returns: Json }
      note_folder_receipt_put: {
        Args: {
          p_command: string
          p_key: string
          p_org_id: string
          p_result: Json
        }
        Returns: undefined
      }
      note_folder_reject: {
        Args: {
          p_action: string
          p_before?: Json
          p_code: string
          p_folder_id: string
          p_message: string
          p_org_id: string
        }
        Returns: Json
      }
      note_folder_same_org_projects: {
        Args: { p_org_id: string; p_project_ids: string[] }
        Returns: boolean
      }
      note_folder_visible_payload: {
        Args: { p_folder_id: string }
        Returns: Json
      }
      note_folder_write_audit: {
        Args: {
          p_accepted: boolean
          p_action: string
          p_after: Json
          p_before: Json
          p_error_code: string
          p_folder_id: string
          p_metadata?: Json
          p_org_id: string
        }
        Returns: string
      }
      ops_snapshot: { Args: never; Returns: Json }
      org_plan_usage: { Args: { p_org_id: string }; Returns: Json }
      org_portfolio_snapshot: { Args: { p_org_id: string }; Returns: Json }
      pay_application_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      piece_control_drawing_is_approved: {
        Args: { p_drawing_id: string }
        Returns: boolean
      }
      piece_control_pilot_readiness: {
        Args: { p_project_id: string }
        Returns: Json
      }
      piece_import_normalize_payload: {
        Args: { p_payload: Json; p_source_type: string }
        Returns: Json
      }
      piece_import_reconcile_row: {
        Args: { p_payload: Json; p_project_id: string; p_source_type: string }
        Returns: {
          decision: string
          matched_piece_id: string
          normalized_payload: Json
          warnings: string[]
        }[]
      }
      place_drawing_hold: {
        Args: { p_drawing_id: string; p_reason: string }
        Returns: {
          created_at: string
          drawing_id: string
          id: string
          is_active: boolean
          metadata: Json
          placed_at: string
          placed_by_id: string | null
          placed_by_name: string | null
          prior_release_status: string | null
          prior_stage: string | null
          project_id: string
          reason: string
          release_notes: string | null
          released_at: string | null
          released_by_id: string | null
          released_by_name: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "drawing_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      plan_limits: { Args: { p_plan: string }; Returns: Json }
      plan_member_limit: { Args: { p_plan: string }; Returns: number }
      plan_project_limit: { Args: { p_plan: string }; Returns: number }
      project_row_counts: { Args: { p_project_id: string }; Returns: Json }
      prune_client_events: { Args: { p_days?: number }; Returns: number }
      publish_drawing_revision: {
        Args: { p_release_status?: string; p_revision_id: string }
        Returns: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          drawing_id: string
          file_id: string | null
          file_url: string | null
          id: string
          is_current: boolean
          issued_at: string | null
          pdf_page: number | null
          project_id: string
          received_at: string | null
          release_status: string
          revision_code: string
          revision_name: string | null
          revision_notes: string | null
          revision_reason: string | null
          revision_source: string | null
          sheet_number: string
          sheet_title: string
          supersedes_revision_id: string | null
          updated_at: string
          updated_by: string | null
          version_number: number
          viewer_height: number | null
          viewer_width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "drawing_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      raise_if_drawing_set_locked: {
        Args: { p_set_id: string }
        Returns: undefined
      }
      raise_meeting_action_items: {
        Args: { p_items: Json; p_meeting_id: string }
        Returns: {
          action_date: string | null
          action_number: string | null
          archived_at: string | null
          assigned_to: string | null
          assigned_user_id: string | null
          category: string | null
          completed_at: string | null
          completed_by: string | null
          constraint_number: string | null
          constraint_type: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          follow_up_date: string | null
          id: string
          impact_date: string | null
          is_deleted: boolean
          meeting_id: string | null
          meeting_reference: string | null
          metadata: Json | null
          priority: string
          project_area: string | null
          project_id: string
          project_name: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          status: string
          title: string | null
          updated_at: string | null
          waiting_on: string | null
          work_package_id: string | null
          workstream: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "action_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      receive_delivery: {
        Args: {
          p_actual_date?: string
          p_advance_pieces?: boolean
          p_delivery_id: string
          p_notes?: string
          p_received_by: string
        }
        Returns: Json
      }
      recompute_schedule_summary: {
        Args: { p_task_id: string }
        Returns: undefined
      }
      reconcile_stuck_extractions: { Args: never; Returns: number }
      record_piece_control_command_failure: {
        Args: {
          p_command_name: string
          p_context: Json
          p_entity_ids: string[]
          p_error_code: string
          p_error_detail: string
          p_error_message: string
          p_project_id: string
        }
        Returns: Json
      }
      record_revision_comparison: {
        Args: {
          p_comparison_id: string
          p_deltas?: Json
          p_error?: string
          p_model?: string
          p_raw?: Json
          p_stats?: Json
          p_status: string
          p_summary?: string
        }
        Returns: {
          ai_summary: string | null
          compare_status: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delta_count: number | null
          deterministic_stats: Json | null
          drawing_id: string | null
          error_message: string | null
          from_analysis_id: string | null
          from_revision_id: string | null
          id: string
          is_deleted: boolean
          metadata: Json | null
          model: string | null
          project_id: string | null
          raw_ai_response: Json | null
          requested_by: string | null
          source: string
          to_analysis_id: string | null
          to_revision_id: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "drawing_revision_comparisons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_submittal_response: {
        Args: {
          p_ball_in_court?: string
          p_notes?: string
          p_returned_date: string
          p_round_id: string
          p_sheet_responses?: Json
          p_status: string
        }
        Returns: {
          approval_chain: Json | null
          approval_chain_step: number | null
          approved_date: string | null
          approver_notes: Json
          ball_in_court: string | null
          created_at: string | null
          current_round_id: string | null
          days_in_review: number | null
          deleted_at: string | null
          derived_stage: string | null
          discipline: string | null
          distributed_to: string | null
          drawing_set_ids: string[] | null
          external_id: string | null
          external_source: string | null
          fab_release_override_reason: string | null
          file_url: string | null
          gate_override_at: string | null
          gate_override_by: string | null
          gate_override_reason: string | null
          id: string
          is_deleted: boolean | null
          linked_rfi_ids: string[] | null
          linked_task_ids: string[] | null
          metadata: Json | null
          notes: string | null
          parent_submittal_id: string | null
          project_id: string
          project_name: string | null
          received_from: string | null
          required_date: string | null
          returned_date: string | null
          reviewer: string | null
          revision: string | null
          round_number: number | null
          spec_section: string | null
          split_reason: string | null
          stage_entered_at: string | null
          status: string
          submittal_number: string
          submittal_type: string | null
          submitted_by: string | null
          submitted_date: string | null
          title: string
          total_rounds: number
          transmittal_number: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "submittals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recount_drawing_set: { Args: { p_set_id: string }; Returns: undefined }
      refresh_cost_code_actual: {
        Args: { p_cost_code_id: string }
        Returns: undefined
      }
      refresh_pay_application_totals: {
        Args: { p_id: string }
        Returns: undefined
      }
      refresh_project_change_total: {
        Args: { p_project_id: string }
        Returns: number
      }
      refresh_work_package_progress: {
        Args: { p_work_package_id: string }
        Returns: Json
      }
      regenerate_pay_application_lines: {
        Args: { p_id: string }
        Returns: {
          application_label: string | null
          application_number: number
          approved_by: string | null
          balance_to_finish: number
          certified_date: string | null
          created_at: string
          created_by: string | null
          current_payment_due: number
          deleted_at: string | null
          id: string
          is_deleted: boolean
          less_previous_certificates: number
          metadata: Json
          net_change_orders: number
          notes: string | null
          original_contract_sum: number
          paid_date: string | null
          period_from: string | null
          period_to: string | null
          project_id: string
          retainage_percent: number
          sov_reconciles: boolean | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          total_completed_stored: number
          total_earned_less_retainage: number
          total_retainage: number
          updated_at: string
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pay_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_model: {
        Args: {
          p_payload: Json
          p_project_id: string
          p_supersede_active?: boolean
        }
        Returns: {
          cloud_model_id: string | null
          cloud_url: string | null
          coordinate_system: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          element_count: number | null
          file_name: string
          file_type: string
          file_url: string | null
          id: string
          is_deleted: boolean
          linked_drawings: Json | null
          linked_rfis: Json | null
          linked_work_packages: Json | null
          metadata: Json | null
          notes: string | null
          project_id: string
          revision_number: number | null
          source: string
          status: string
          superseded_at: string | null
          superseded_by: string | null
          updated_at: string | null
          upload_date: string | null
          version: string | null
        }
        SetofOptions: {
          from: "*"
          to: "model_registry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_drawing_hold: {
        Args: { p_hold_id: string; p_notes?: string }
        Returns: {
          created_at: string
          drawing_id: string
          id: string
          is_active: boolean
          metadata: Json
          placed_at: string
          placed_by_id: string | null
          placed_by_name: string | null
          prior_release_status: string | null
          prior_stage: string | null
          project_id: string
          reason: string
          release_notes: string | null
          released_at: string | null
          released_by_id: string | null
          released_by_name: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "drawing_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_package_for_fabrication: {
        Args: {
          p_drawing_set_id: string
          p_notes?: string
          p_override_reason?: string
          p_project_id: string
        }
        Returns: {
          blockers: Json
          blocking_rfi_numbers: string[]
          created_at: string
          drawing_count: number
          drawing_ids: string[]
          drawing_set_id: string | null
          governing_stage: string | null
          id: string
          is_override: boolean
          metadata: Json
          notes: string | null
          override_reason: string | null
          package_kind: string
          package_name: string | null
          project_id: string
          released_at: string
          released_by: string | null
          released_by_name: string | null
          submittal_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fab_release_log"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_work_package_canonical: {
        Args: { p_exception_reason?: string; p_work_package_id: string }
        Returns: Json
      }
      release_work_package_canonical_impl: {
        Args: { p_exception_reason?: string; p_work_package_id: string }
        Returns: Json
      }
      rename_note_folder: {
        Args: {
          p_expected_version: number
          p_folder_id: string
          p_idempotency_key?: string
          p_name: string
        }
        Returns: Json
      }
      reopen_project_closeout: {
        Args: { p_project_id: string; p_reason: string }
        Returns: {
          as_built_complete: boolean | null
          blockers_at_completion: Json | null
          certificate_of_occupancy: string | null
          checklist: Json | null
          closeout_date: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          final_completion_date: string | null
          final_inspection_date: string | null
          id: string
          is_deleted: boolean
          manuals_complete: boolean | null
          metadata: Json | null
          notes: string | null
          override_by: string | null
          override_reason: string | null
          project_id: string
          project_name: string | null
          punchlist_complete: boolean | null
          reopen_reason: string | null
          status: string | null
          substantial_completion_date: string | null
          updated_at: string | null
          warranties_complete: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "project_closeout"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_org_data: {
        Args: { p_confirmation: string; p_org_id: string }
        Returns: Json
      }
      restore_note_folder: {
        Args: {
          p_expected_version: number
          p_folder_id: string
          p_idempotency_key?: string
        }
        Returns: Json
      }
      risk_severity: { Args: { p_score: number }; Returns: string }
      risk_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      save_titleblock_map: {
        Args: {
          p_number_rect: Json
          p_project_id: string
          p_register: string
          p_revision_rect: Json
          p_title_rect: Json
        }
        Returns: number
      }
      scope_item_apply_progress: {
        Args: {
          p_new: Database["public"]["Tables"]["scope_items"]["Row"]
          p_old: Database["public"]["Tables"]["scope_items"]["Row"]
        }
        Returns: {
          added_by: string | null
          category: string | null
          change_order_id: string | null
          completed_at: string | null
          completed_by: string | null
          completed_by_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_id: string | null
          file_name: string | null
          file_url: string | null
          id: string
          in_progress: boolean
          in_progress_at: string | null
          in_progress_by: string | null
          is_completed: boolean
          is_deleted: boolean
          item_type: string
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          reference: string | null
          scope_number: string | null
          sort_order: number | null
          storage_path: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "scope_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      scope_item_check_links: {
        Args: { p_row: Database["public"]["Tables"]["scope_items"]["Row"] }
        Returns: undefined
      }
      seed_cost_codes_from_defaults: {
        Args: { p_project_id: string }
        Returns: number
      }
      seed_default_piece_stations: {
        Args: { p_actor?: string; p_project_id: string }
        Returns: undefined
      }
      seed_project_handoff_items: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      send_transmittal: {
        Args: { p_sent_date?: string; p_transmittal_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by_name: string | null
          acknowledged_notes: string | null
          created_at: string
          created_by: string | null
          date_received: string | null
          date_sent: string | null
          deleted_at: string | null
          direction: string
          id: string
          is_deleted: boolean
          metadata: Json
          notes: string | null
          project_id: string
          purpose: string | null
          received_from: string | null
          recipient_company: string | null
          recipient_email: string | null
          sent_by: string | null
          sent_by_name: string | null
          sent_to: string | null
          source_company: string | null
          status: string
          subject: string | null
          submittal_id: string | null
          submittal_round_id: string | null
          transmittal_number: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "drawing_transmittals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_delivery_items: {
        Args: { p_delivery_id: string; p_items: Json }
        Returns: {
          assembly_mark: string | null
          created_at: string | null
          delivery_id: string | null
          finish: string | null
          grade: string | null
          id: string
          length_inches: number | null
          length_text: string | null
          line_no: number | null
          metadata: Json | null
          notes: string | null
          piece_id: string | null
          profile: string | null
          qty: number
          received_at: string | null
          received_qty: number | null
          sequence: string | null
          updated_at: string | null
          weight_lbs: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "delivery_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_feature_flag: {
        Args: { p_description?: string; p_enabled: boolean; p_flag_key: string }
        Returns: {
          created_at: string
          description: string | null
          enabled: boolean
          flag_key: string
          id: string
          updated_at: string
          updated_by: string | null
          user_overrides: Json
        }
        SetofOptions: {
          from: "*"
          to: "feature_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_feature_flag_override: {
        Args: { p_email: string; p_flag_key: string; p_value: boolean }
        Returns: {
          created_at: string
          description: string | null
          enabled: boolean
          flag_key: string
          id: string
          updated_at: string
          updated_by: string | null
          user_overrides: Json
        }
        SetofOptions: {
          from: "*"
          to: "feature_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_for_drawing_is_locked: {
        Args: { p_drawing_id: string }
        Returns: boolean
      }
      set_for_zone_is_locked: { Args: { p_zone_id: string }; Returns: boolean }
      set_material_requirement_receipt_state: {
        Args: {
          p_material_requirement_id: string
          p_project_id: string
          p_provenance?: Json
          p_receipt_reference?: string
          p_receipt_source?: string
          p_receipt_state: string
          p_received_quantity?: number
        }
        Returns: Json
      }
      set_note_folder_links: {
        Args: {
          p_expected_version: number
          p_folder_id: string
          p_idempotency_key?: string
          p_make_independent?: boolean
          p_project_ids: string[]
        }
        Returns: Json
      }
      set_piece_control_mode: {
        Args: {
          p_confirmation: string
          p_next_mode: string
          p_project_id: string
        }
        Returns: Json
      }
      set_piece_hold: {
        Args: {
          p_on_hold: boolean
          p_piece_ids: string[]
          p_project_id: string
          p_reason?: string
        }
        Returns: Json
      }
      set_piece_hold_impl: {
        Args: {
          p_on_hold: boolean
          p_piece_ids: string[]
          p_project_id: string
          p_reason?: string
        }
        Returns: Json
      }
      set_project_station_configuration: {
        Args: { p_project_id: string; p_stations: Json }
        Returns: Json
      }
      set_runtime_config: {
        Args: {
          p_description?: string
          p_is_public?: boolean
          p_key: string
          p_value: Json
        }
        Returns: {
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        SetofOptions: {
          from: "*"
          to: "runtime_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_transmittal_items: {
        Args: { p_refs: Json; p_transmittal_id: string }
        Returns: {
          created_at: string
          drawing_id: string | null
          drawing_revision_id: string | null
          gc_drawing_id: string | null
          id: string
          notes: string | null
          number_at_send: string | null
          project_id: string
          revision_at_send: string | null
          sort_order: number
          title_at_send: string | null
          transmittal_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "drawing_transmittal_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ship_piece_lots: {
        Args: {
          p_piece_ids: string[]
          p_project_id: string
          p_reference_data?: Json
        }
        Returns: Json
      }
      ship_piece_lots_impl: {
        Args: {
          p_piece_ids: string[]
          p_project_id: string
          p_reference_data?: Json
        }
        Returns: Json
      }
      soft_delete_project: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      split_piece_lot: {
        Args: { p_allocations: Json; p_piece_id: string; p_project_id: string }
        Returns: Json
      }
      split_piece_lot_impl: {
        Args: { p_allocations: Json; p_piece_id: string; p_project_id: string }
        Returns: Json
      }
      stage_piece_import_batch: {
        Args: {
          p_project_id: string
          p_rows: Json
          p_source_name: string
          p_source_type: string
        }
        Returns: Json
      }
      submittal_bic_class: { Args: { p_bic: string }; Returns: string }
      submittal_blocking_rfis: {
        Args: { p_submittal_id: string }
        Returns: {
          id: string
          project_id: string
          rfi_number: string
          status: string
          title: string
        }[]
      }
      submittal_derived_stage: {
        Args: { p_approved_date: string; p_bic: string; p_status: string }
        Returns: string
      }
      submittal_ofs_checklist_complete: {
        Args: { p_metadata: Json }
        Returns: boolean
      }
      supersede_document: {
        Args: { p_document_id: string; p_payload: Json }
        Returns: {
          category: string | null
          change_order_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delivery_id: string | null
          description: string | null
          discipline: string | null
          display_name: string | null
          document_number: string | null
          document_type: string | null
          drawing_number: string | null
          due_date: string | null
          external_drive_id: string | null
          external_file_id: string | null
          external_file_url: string | null
          external_last_modified: string | null
          external_provider: string | null
          external_site_id: string | null
          external_synced_at: string | null
          file_name: string | null
          file_size: number | null
          file_size_kb: number | null
          file_type: string | null
          file_url: string | null
          folder_id: string | null
          id: string
          import_source: string | null
          is_current: boolean | null
          is_deleted: boolean
          is_submittal: boolean | null
          linked_folder_id: string | null
          linked_wp_id: string | null
          metadata: Json | null
          mime_type: string | null
          notes: string | null
          project_id: string
          project_name: string | null
          review_lead_time: number | null
          revision: string | null
          revision_date: string | null
          revision_note: string | null
          revision_number: string | null
          rfi_id: string | null
          sheet_number: string | null
          status: string | null
          submittal_id: string | null
          superseded_by_id: string | null
          supersedes_id: string | null
          tags: string | null
          title: string | null
          updated_at: string | null
          uploaded_by: string | null
          uploaded_by_id: string | null
          uploaded_date: string | null
          version: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_model_fab_status: { Args: { p_project_id: string }; Returns: Json }
      sync_production_stages_to_pieces: {
        Args: { p_project_id: string; p_source?: string; p_updates: Json }
        Returns: Json
      }
      sync_production_stages_to_pieces_impl: {
        Args: { p_project_id: string; p_source?: string; p_updates: Json }
        Returns: Json
      }
      transition_piece_lots_canonical: {
        Args: {
          p_event_type: string
          p_next_status: string
          p_piece_ids: string[]
          p_project_id: string
          p_reference_data?: Json
          p_required_status: string
        }
        Returns: Json
      }
      transmit_submittal_round: {
        Args: {
          p_ball_in_court: string
          p_drawing_set_ids?: string[]
          p_notes?: string
          p_reviewer?: string
          p_submittal_id: string
          p_submitted_date: string
        }
        Returns: {
          ball_in_court: string | null
          created_at: string
          deleted_at: string | null
          drawing_set_ids: string[]
          file_url: string | null
          id: string
          is_deleted: boolean
          markup_file_url: string | null
          metadata: Json
          project_id: string
          response_notes: string | null
          returned_date: string | null
          reviewer: string | null
          round_number: number
          status: string
          submittal_id: string
          submitted_by: string | null
          submitted_date: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "submittal_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unassign_pieces_from_work_package: {
        Args: { p_piece_ids: string[]; p_project_id: string }
        Returns: Json
      }
      unlink_piece_drawing: {
        Args: { p_drawing_id: string; p_piece_id: string; p_project_id: string }
        Returns: Json
      }
      unlink_piece_drawing_set: {
        Args: {
          p_drawing_set_id: string
          p_piece_id: string
          p_project_id: string
        }
        Returns: Json
      }
      user_can_access_note_folder: {
        Args: { p_folder_id: string }
        Returns: boolean
      }
      user_can_edit_note_folder: {
        Args: { p_folder_id: string }
        Returns: boolean
      }
      user_can_manage_note_folder_links: {
        Args: { p_org_id: string; p_project_ids: string[] }
        Returns: boolean
      }
      user_has_project_access: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      user_has_project_role: {
        Args: { p_project_id: string; p_role: string }
        Returns: boolean
      }
      user_has_project_role_at_least: {
        Args: { p_min_role: string; p_project_id: string }
        Returns: boolean
      }
      user_is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      user_is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      user_is_project_admin: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      user_is_system_admin: { Args: never; Returns: boolean }
      user_org_role_at_least: {
        Args: { p_min_role: string; p_org_id: string }
        Returns: boolean
      }
      users_share_org: { Args: { p_a: string; p_b: string }; Returns: boolean }
      validate_piece_station_configuration: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      void_rfi: {
        Args: { p_reason: string; p_rfi_id: string }
        Returns: {
          answer: string | null
          answered_by: string | null
          answered_by_id: string | null
          area_sequence: string | null
          assigned_to: string | null
          ball_in_court: string | null
          closed_at: string | null
          closed_by: string | null
          cost_code_id: string | null
          cost_impact: boolean | null
          cost_impact_amount: number | null
          created_at: string | null
          created_by: string | null
          created_date: string | null
          date_answered: string | null
          date_required: string | null
          deleted_at: string | null
          description: string | null
          discipline: string | null
          distribution_list: string | null
          drawing_id: string | null
          drawing_reference: string | null
          drawing_set_id: string | null
          due_date: string | null
          gc_drawing_id: string | null
          holds_released_count: number
          id: string
          impacts_activity_ids: string[] | null
          internal_notes: string | null
          is_deleted: boolean
          metadata: Json | null
          priority: string
          project_id: string
          project_name: string | null
          question: string | null
          responded_date: string | null
          response_text: string | null
          rfi_number: string | null
          schedule_impact: boolean | null
          schedule_impact_days: number | null
          spec_section: string | null
          status: string
          submitted_by: string | null
          submitted_date: string | null
          title: string | null
          updated_at: string | null
          void_reason: string | null
          work_package_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rfis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_transmittal: {
        Args: { p_reason: string; p_transmittal_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by_name: string | null
          acknowledged_notes: string | null
          created_at: string
          created_by: string | null
          date_received: string | null
          date_sent: string | null
          deleted_at: string | null
          direction: string
          id: string
          is_deleted: boolean
          metadata: Json
          notes: string | null
          project_id: string
          purpose: string | null
          received_from: string | null
          recipient_company: string | null
          recipient_email: string | null
          sent_by: string | null
          sent_by_name: string | null
          sent_to: string | null
          source_company: string | null
          status: string
          subject: string | null
          submittal_id: string | null
          submittal_round_id: string | null
          transmittal_number: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "drawing_transmittals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      work_package_drawing_set_reports: {
        Args: { p_work_package_id: string }
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
