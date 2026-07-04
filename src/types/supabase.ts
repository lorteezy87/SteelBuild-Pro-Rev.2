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
      action_items: {
        Row: {
          assigned_to: string | null
          category: string | null
          constraint_number: string | null
          constraint_type: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          meeting_reference: string | null
          metadata: Json | null
          priority: string
          project_area: string | null
          project_id: string
          project_name: string | null
          status: string
          title: string | null
          updated_at: string | null
          work_package_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          constraint_number?: string | null
          constraint_type?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_reference?: string | null
          metadata?: Json | null
          priority?: string
          project_area?: string | null
          project_id: string
          project_name?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          constraint_number?: string | null
          constraint_type?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_reference?: string | null
          metadata?: Json | null
          priority?: string
          project_area?: string | null
          project_id?: string
          project_name?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
          work_package_id?: string | null
        }
        Relationships: [
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
      budget_hour_items: {
        Row: {
          category: string
          created_at: string | null
          deleted_at: string | null
          field_hours_actual: number | null
          field_hours_budget: number | null
          id: string
          is_deleted: boolean | null
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
          deleted_at?: string | null
          field_hours_actual?: number | null
          field_hours_budget?: number | null
          id?: string
          is_deleted?: boolean | null
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
          deleted_at?: string | null
          field_hours_actual?: number | null
          field_hours_budget?: number | null
          id?: string
          is_deleted?: boolean | null
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
          approved_by: string | null
          approved_date: string | null
          attachments: string | null
          co_amount: number | null
          co_number: string | null
          cost_code_id: string | null
          created_at: string | null
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
          sov_line_item_id: string | null
          sov_line_number: number | null
          status: string
          submitted_date: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          approved_by?: string | null
          approved_date?: string | null
          attachments?: string | null
          co_amount?: number | null
          co_number?: string | null
          cost_code_id?: string | null
          created_at?: string | null
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
          sov_line_item_id?: string | null
          sov_line_number?: number | null
          status?: string
          submitted_date?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_by?: string | null
          approved_date?: string | null
          attachments?: string | null
          co_amount?: number | null
          co_number?: string | null
          cost_code_id?: string | null
          created_at?: string | null
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
          sov_line_item_id?: string | null
          sov_line_number?: number | null
          status?: string
          submitted_date?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
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
          created_at: string | null
          description: string | null
          estimated_cost_impact: number | null
          estimated_schedule_impact_days: number | null
          id: string
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
          created_at?: string | null
          description?: string | null
          estimated_cost_impact?: number | null
          estimated_schedule_impact_days?: number | null
          id?: string
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
          created_at?: string | null
          description?: string | null
          estimated_cost_impact?: number | null
          estimated_schedule_impact_days?: number | null
          id?: string
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
            foreignKeyName: "change_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          description: string | null
          forecast_to_complete: number | null
          id: string
          metadata: Json | null
          notes: string | null
          phase: string | null
          project_id: string
          project_name: string | null
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
          description?: string | null
          forecast_to_complete?: number | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          phase?: string | null
          project_id: string
          project_name?: string | null
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
          description?: string | null
          forecast_to_complete?: number | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          phase?: string | null
          project_id?: string
          project_name?: string | null
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
          created_at: string | null
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
          metadata: Json | null
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
          created_at?: string | null
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
          metadata?: Json | null
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
          created_at?: string | null
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
          metadata?: Json | null
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
          po_number: string | null
          priority: string
          procurement_category: string | null
          project_id: string
          project_name: string | null
          received_by: string | null
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
          po_number?: string | null
          priority?: string
          procurement_category?: string | null
          project_id: string
          project_name?: string | null
          received_by?: string | null
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
          po_number?: string | null
          priority?: string
          procurement_category?: string | null
          project_id?: string
          project_name?: string | null
          received_by?: string | null
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
          profile: string | null
          qty: number
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
          profile?: string | null
          qty?: number
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
          profile?: string | null
          qty?: number
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
        ]
      }
      document_folders: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean
          name: string
          parent_folder_id: string | null
          project_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          parent_folder_id?: string | null
          project_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          parent_folder_id?: string | null
          project_id?: string
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
          project_id: string
          project_name: string | null
          review_lead_time: number | null
          revision: string | null
          revision_date: string | null
          revision_number: string | null
          rfi_id: string | null
          sheet_number: string | null
          status: string | null
          submittal_id: string | null
          tags: string | null
          title: string | null
          updated_at: string | null
          uploaded_by: string | null
          uploaded_date: string | null
          version: string | null
          work_package_id: string | null
        }
        Insert: {
          category?: string | null
          change_order_id?: string | null
          created_at?: string | null
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
          project_id: string
          project_name?: string | null
          review_lead_time?: number | null
          revision?: string | null
          revision_date?: string | null
          revision_number?: string | null
          rfi_id?: string | null
          sheet_number?: string | null
          status?: string | null
          submittal_id?: string | null
          tags?: string | null
          title?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          uploaded_date?: string | null
          version?: string | null
          work_package_id?: string | null
        }
        Update: {
          category?: string | null
          change_order_id?: string | null
          created_at?: string | null
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
          project_id?: string
          project_name?: string | null
          review_lead_time?: number | null
          revision?: string | null
          revision_date?: string | null
          revision_number?: string | null
          rfi_id?: string | null
          sheet_number?: string | null
          status?: string | null
          submittal_id?: string | null
          tags?: string | null
          title?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
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
          created_at: string | null
          delta_count: number | null
          error_message: string | null
          from_analysis_id: string
          id: string
          metadata: Json | null
          model: string | null
          project_id: string | null
          raw_ai_response: Json | null
          requested_by: string | null
          to_analysis_id: string
          updated_at: string | null
        }
        Insert: {
          ai_summary?: string | null
          compare_status?: string | null
          created_at?: string | null
          delta_count?: number | null
          error_message?: string | null
          from_analysis_id: string
          id?: string
          metadata?: Json | null
          model?: string | null
          project_id?: string | null
          raw_ai_response?: Json | null
          requested_by?: string | null
          to_analysis_id: string
          updated_at?: string | null
        }
        Update: {
          ai_summary?: string | null
          compare_status?: string | null
          created_at?: string | null
          delta_count?: number | null
          error_message?: string | null
          from_analysis_id?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          project_id?: string | null
          raw_ai_response?: Json | null
          requested_by?: string | null
          to_analysis_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revision_comparisons_from_analysis_id_fkey"
            columns: ["from_analysis_id"]
            isOneToOne: false
            referencedRelation: "drawing_analyses"
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
        ]
      }
      drawing_revision_deltas: {
        Row: {
          comparison_id: string | null
          created_at: string | null
          delta_type: string | null
          description: string
          dismissed: boolean | null
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          linked_rfi_id: string | null
          recommended_action: string | null
          severity: string | null
          sheet_number: string | null
          updated_at: string | null
        }
        Insert: {
          comparison_id?: string | null
          created_at?: string | null
          delta_type?: string | null
          description: string
          dismissed?: boolean | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          linked_rfi_id?: string | null
          recommended_action?: string | null
          severity?: string | null
          sheet_number?: string | null
          updated_at?: string | null
        }
        Update: {
          comparison_id?: string | null
          created_at?: string | null
          delta_type?: string | null
          description?: string
          dismissed?: boolean | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          linked_rfi_id?: string | null
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
          titleblock_title_rect: Json | null
          updated_at: string | null
          upload_batch_id: string | null
        }
        Insert: {
          area_sequence?: string | null
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
          titleblock_title_rect?: Json | null
          updated_at?: string | null
          upload_batch_id?: string | null
        }
        Update: {
          area_sequence?: string | null
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
      drawing_transmittal_items: {
        Row: {
          created_at: string
          drawing_revision_id: string
          id: string
          project_id: string
          transmittal_id: string
        }
        Insert: {
          created_at?: string
          drawing_revision_id: string
          id?: string
          project_id: string
          transmittal_id: string
        }
        Update: {
          created_at?: string
          drawing_revision_id?: string
          id?: string
          project_id?: string
          transmittal_id?: string
        }
        Relationships: [
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
          created_at: string
          created_by: string | null
          date_received: string | null
          date_sent: string | null
          direction: string
          id: string
          is_deleted: boolean
          notes: string | null
          project_id: string
          received_from: string | null
          sent_to: string | null
          source_company: string | null
          subject: string | null
          transmittal_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          date_sent?: string | null
          direction?: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          project_id: string
          received_from?: string | null
          sent_to?: string | null
          source_company?: string | null
          subject?: string | null
          transmittal_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          date_sent?: string | null
          direction?: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          project_id?: string
          received_from?: string | null
          sent_to?: string | null
          source_company?: string | null
          subject?: string | null
          transmittal_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_transmittals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          cost_code_name: string | null
          created_at: string | null
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
          payment_date: string | null
          payment_status: string | null
          project_id: string
          project_name: string | null
          quantity: number | null
          receipt_url: string | null
          sov_line_item_id: string | null
          sov_line_item_name: string | null
          submitted_by: string | null
          tags: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string | null
          vendor: string | null
          work_package_id: string | null
          work_package_name: string | null
        }
        Insert: {
          amount?: number | null
          approved_by?: string | null
          approved_date?: string | null
          cost_code?: string | null
          cost_code_name?: string | null
          created_at?: string | null
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
          payment_date?: string | null
          payment_status?: string | null
          project_id: string
          project_name?: string | null
          quantity?: number | null
          receipt_url?: string | null
          sov_line_item_id?: string | null
          sov_line_item_name?: string | null
          submitted_by?: string | null
          tags?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          vendor?: string | null
          work_package_id?: string | null
          work_package_name?: string | null
        }
        Update: {
          amount?: number | null
          approved_by?: string | null
          approved_date?: string | null
          cost_code?: string | null
          cost_code_name?: string | null
          created_at?: string | null
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
          payment_date?: string | null
          payment_status?: string | null
          project_id?: string
          project_name?: string | null
          quantity?: number | null
          receipt_url?: string | null
          sov_line_item_id?: string | null
          sov_line_item_name?: string | null
          submitted_by?: string | null
          tags?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          vendor?: string | null
          work_package_id?: string | null
          work_package_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      fab_release_overrides: {
        Row: {
          blocking_rfi_numbers: string[]
          created_at: string
          drawing_count: number | null
          id: string
          overridden_by: string | null
          package_kind: string | null
          package_name: string | null
          project_id: string
          reason: string | null
        }
        Insert: {
          blocking_rfi_numbers?: string[]
          created_at?: string
          drawing_count?: number | null
          id?: string
          overridden_by?: string | null
          package_kind?: string | null
          package_name?: string | null
          project_id: string
          reason?: string | null
        }
        Update: {
          blocking_rfi_numbers?: string[]
          created_at?: string
          drawing_count?: number | null
          id?: string
          overridden_by?: string | null
          package_kind?: string | null
          package_name?: string | null
          project_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fab_release_overrides_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      fab_releases: {
        Row: {
          created_at: string | null
          id: string
          is_deleted: boolean | null
          name: string
          notes: string | null
          piece_count: number | null
          piece_marks: string | null
          project_id: string | null
          release_date: string | null
          release_number: string
          required_date: string | null
          status: string
          weight_tons: number | null
          work_package_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          name: string
          notes?: string | null
          piece_count?: number | null
          piece_marks?: string | null
          project_id?: string | null
          release_date?: string | null
          release_number: string
          required_date?: string | null
          status?: string
          weight_tons?: number | null
          work_package_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          name?: string
          notes?: string | null
          piece_count?: number | null
          piece_marks?: string | null
          project_id?: string | null
          release_date?: string | null
          release_number?: string
          required_date?: string | null
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
          user_overrides: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key: string
          id?: string
          updated_at?: string
          user_overrides?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key?: string
          id?: string
          updated_at?: string
          user_overrides?: Json
        }
        Relationships: []
      }
      inspections: {
        Row: {
          corrective_actions: string | null
          created_at: string | null
          deficiencies_count: number | null
          deleted_at: string | null
          description: string | null
          findings: string | null
          id: string
          inspection_date: string | null
          inspection_type: string | null
          inspector_name: string | null
          inspector_role: string | null
          is_deleted: boolean
          location: string | null
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          sign_off_status: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          corrective_actions?: string | null
          created_at?: string | null
          deficiencies_count?: number | null
          deleted_at?: string | null
          description?: string | null
          findings?: string | null
          id?: string
          inspection_date?: string | null
          inspection_type?: string | null
          inspector_name?: string | null
          inspector_role?: string | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          project_id: string
          project_name?: string | null
          sign_off_status?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          corrective_actions?: string | null
          created_at?: string | null
          deficiencies_count?: number | null
          deleted_at?: string | null
          description?: string | null
          findings?: string | null
          id?: string
          inspection_date?: string | null
          inspection_type?: string | null
          inspector_name?: string | null
          inspector_role?: string | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          project_id?: string
          project_name?: string | null
          sign_off_status?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          constraints: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          status: string | null
          tasks: Json | null
          updated_at: string | null
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          constraints?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          project_id: string
          project_name?: string | null
          status?: string | null
          tasks?: Json | null
          updated_at?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          constraints?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
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
      meetings: {
        Row: {
          attendees: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean
          location: string | null
          meeting_date: string | null
          meeting_type: string | null
          metadata: Json | null
          minutes: string | null
          next_meeting_date: string | null
          project_id: string
          project_name: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          attendees?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_type?: string | null
          metadata?: Json | null
          minutes?: string | null
          next_meeting_date?: string | null
          project_id: string
          project_name?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          attendees?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_type?: string | null
          metadata?: Json | null
          minutes?: string | null
          next_meeting_date?: string | null
          project_id?: string
          project_name?: string | null
          status?: string | null
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
          description: string
          follow_up_date: string | null
          follow_up_required: boolean | null
          id: string
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
          description: string
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
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
          description?: string
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
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
          cost_exposure: number | null
          created_at: string | null
          expected_recovery: number | null
          id: string
          identified_by: string | null
          identified_date: string | null
          impact_types: string | null
          internal_notes: string | null
          is_co_candidate: boolean | null
          issue_source: string | null
          mitigation_number: string | null
          notice_method: string | null
          notice_sent_date: string | null
          notice_sent_to: string | null
          project_id: string
          recovery_likelihood: number | null
          responsible_party: string | null
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
          cost_exposure?: number | null
          created_at?: string | null
          expected_recovery?: number | null
          id?: string
          identified_by?: string | null
          identified_date?: string | null
          impact_types?: string | null
          internal_notes?: string | null
          is_co_candidate?: boolean | null
          issue_source?: string | null
          mitigation_number?: string | null
          notice_method?: string | null
          notice_sent_date?: string | null
          notice_sent_to?: string | null
          project_id: string
          recovery_likelihood?: number | null
          responsible_party?: string | null
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
          cost_exposure?: number | null
          created_at?: string | null
          expected_recovery?: number | null
          id?: string
          identified_by?: string | null
          identified_date?: string | null
          impact_types?: string | null
          internal_notes?: string | null
          is_co_candidate?: boolean | null
          issue_source?: string | null
          mitigation_number?: string | null
          notice_method?: string | null
          notice_sent_date?: string | null
          notice_sent_to?: string | null
          project_id?: string
          recovery_likelihood?: number | null
          responsible_party?: string | null
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
            foreignKeyName: "mitigation_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          id: string
          is_deleted: boolean
          material_grade: string | null
          metadata: Json
          model_id: string | null
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
          id?: string
          is_deleted?: boolean
          material_grade?: string | null
          metadata?: Json
          model_id?: string | null
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
          id?: string
          is_deleted?: boolean
          material_grade?: string | null
          metadata?: Json
          model_id?: string | null
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
          deleted_at: string | null
          document_id: string | null
          file_name: string
          file_type: string
          file_url: string | null
          id: string
          is_deleted: boolean | null
          linked_drawings: Json | null
          linked_rfis: Json | null
          linked_work_packages: Json | null
          metadata: Json | null
          project_id: string
          revision_number: number | null
          source: string
          status: string
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
          deleted_at?: string | null
          document_id?: string | null
          file_name: string
          file_type: string
          file_url?: string | null
          id?: string
          is_deleted?: boolean | null
          linked_drawings?: Json | null
          linked_rfis?: Json | null
          linked_work_packages?: Json | null
          metadata?: Json | null
          project_id: string
          revision_number?: number | null
          source?: string
          status?: string
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
          deleted_at?: string | null
          document_id?: string | null
          file_name?: string
          file_type?: string
          file_url?: string | null
          id?: string
          is_deleted?: boolean | null
          linked_drawings?: Json | null
          linked_rfis?: Json | null
          linked_work_packages?: Json | null
          metadata?: Json | null
          project_id?: string
          revision_number?: number | null
          source?: string
          status?: string
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
      photos: {
        Row: {
          category: string | null
          created_at: string | null
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
        }
        Insert: {
          category?: string | null
          created_at?: string | null
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
        }
        Update: {
          category?: string | null
          created_at?: string | null
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
        ]
      }
      pma_assumptions: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          notes: string | null
          owner: string | null
          project_id: string
          project_name: string | null
          risk_level: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          owner?: string | null
          project_id: string
          project_name?: string | null
          risk_level?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          owner?: string | null
          project_id?: string
          project_name?: string | null
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
          decided_by: string | null
          decision_date: string | null
          description: string | null
          id: string
          impact: string | null
          metadata: Json | null
          project_id: string
          project_name: string | null
          rationale: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          alternatives?: string | null
          category?: string | null
          created_at?: string | null
          decided_by?: string | null
          decision_date?: string | null
          description?: string | null
          id?: string
          impact?: string | null
          metadata?: Json | null
          project_id: string
          project_name?: string | null
          rationale?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          alternatives?: string | null
          category?: string | null
          created_at?: string | null
          decided_by?: string | null
          decision_date?: string | null
          description?: string | null
          id?: string
          impact?: string | null
          metadata?: Json | null
          project_id?: string
          project_name?: string | null
          rationale?: string | null
          status?: string | null
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
        ]
      }
      production_notes: {
        Row: {
          author: string | null
          category: string | null
          content: string | null
          created_at: string | null
          date: string | null
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
            foreignKeyName: "production_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_closeout: {
        Row: {
          as_built_complete: boolean | null
          certificate_of_occupancy: string | null
          checklist: Json | null
          closeout_date: string | null
          created_at: string | null
          final_inspection_date: string | null
          id: string
          manuals_complete: boolean | null
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          punchlist_complete: boolean | null
          status: string | null
          updated_at: string | null
          warranties_complete: boolean | null
        }
        Insert: {
          as_built_complete?: boolean | null
          certificate_of_occupancy?: string | null
          checklist?: Json | null
          closeout_date?: string | null
          created_at?: string | null
          final_inspection_date?: string | null
          id?: string
          manuals_complete?: boolean | null
          metadata?: Json | null
          notes?: string | null
          project_id: string
          project_name?: string | null
          punchlist_complete?: boolean | null
          status?: string | null
          updated_at?: string | null
          warranties_complete?: boolean | null
        }
        Update: {
          as_built_complete?: boolean | null
          certificate_of_occupancy?: string | null
          checklist?: Json | null
          closeout_date?: string | null
          created_at?: string | null
          final_inspection_date?: string | null
          id?: string
          manuals_complete?: boolean | null
          metadata?: Json | null
          notes?: string | null
          project_id?: string
          project_name?: string | null
          punchlist_complete?: boolean | null
          status?: string | null
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
          completed_by: string | null
          created_at: string
          date_completed: string | null
          date_required: string | null
          description: string
          id: string
          notes: string | null
          project_id: string
          seq: number
          status: string
          updated_at: string
        }
        Insert: {
          completed_by?: string | null
          created_at?: string
          date_completed?: string | null
          date_required?: string | null
          description: string
          id?: string
          notes?: string | null
          project_id: string
          seq: number
          status?: string
          updated_at?: string
        }
        Update: {
          completed_by?: string | null
          created_at?: string
          date_completed?: string | null
          date_required?: string | null
          description?: string
          id?: string
          notes?: string | null
          project_id?: string
          seq?: number
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
          original_contract_value: number | null
          phase: string
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
          original_contract_value?: number | null
          phase?: string
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
          original_contract_value?: number | null
          phase?: string
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
        ]
      }
      punchlist_items: {
        Row: {
          assigned_to: string | null
          category: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
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
          photos: Json | null
          priority: string
          project_id: string
          project_name: string | null
          status: string
          target_completion_date: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
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
          photos?: Json | null
          priority?: string
          project_id: string
          project_name?: string | null
          status?: string
          target_completion_date?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
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
          photos?: Json | null
          priority?: string
          project_id?: string
          project_name?: string | null
          status?: string
          target_completion_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
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
        ]
      }
      quality_control_records: {
        Row: {
          acceptance_criteria: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean
          location: string | null
          material_or_component: string | null
          metadata: Json | null
          notes: string | null
          project_id: string
          project_name: string | null
          quantity_passed: number | null
          quantity_tested: number | null
          result: string | null
          specification: string | null
          status: string | null
          test_date: string | null
          test_lab_or_inspector: string | null
          test_type: string | null
          test_value: string | null
          updated_at: string | null
        }
        Insert: {
          acceptance_criteria?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          material_or_component?: string | null
          metadata?: Json | null
          notes?: string | null
          project_id: string
          project_name?: string | null
          quantity_passed?: number | null
          quantity_tested?: number | null
          result?: string | null
          specification?: string | null
          status?: string | null
          test_date?: string | null
          test_lab_or_inspector?: string | null
          test_type?: string | null
          test_value?: string | null
          updated_at?: string | null
        }
        Update: {
          acceptance_criteria?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          material_or_component?: string | null
          metadata?: Json | null
          notes?: string | null
          project_id?: string
          project_name?: string | null
          quantity_passed?: number | null
          quantity_tested?: number | null
          result?: string | null
          specification?: string | null
          status?: string | null
          test_date?: string | null
          test_lab_or_inspector?: string | null
          test_type?: string | null
          test_value?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_control_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          area_sequence: string | null
          assigned_to: string | null
          ball_in_court: string | null
          cost_code_id: string | null
          cost_impact: boolean | null
          cost_impact_amount: number | null
          created_at: string | null
          created_date: string | null
          date_answered: string | null
          date_required: string | null
          deleted_at: string | null
          description: string | null
          discipline: string | null
          distribution_list: string | null
          drawing_reference: string | null
          drawing_set_id: string | null
          due_date: string | null
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
          work_package_id: string | null
        }
        Insert: {
          answer?: string | null
          answered_by?: string | null
          area_sequence?: string | null
          assigned_to?: string | null
          ball_in_court?: string | null
          cost_code_id?: string | null
          cost_impact?: boolean | null
          cost_impact_amount?: number | null
          created_at?: string | null
          created_date?: string | null
          date_answered?: string | null
          date_required?: string | null
          deleted_at?: string | null
          description?: string | null
          discipline?: string | null
          distribution_list?: string | null
          drawing_reference?: string | null
          drawing_set_id?: string | null
          due_date?: string | null
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
          work_package_id?: string | null
        }
        Update: {
          answer?: string | null
          answered_by?: string | null
          area_sequence?: string | null
          assigned_to?: string | null
          ball_in_court?: string | null
          cost_code_id?: string | null
          cost_impact?: boolean | null
          cost_impact_amount?: number | null
          created_at?: string | null
          created_date?: string | null
          date_answered?: string | null
          date_required?: string | null
          deleted_at?: string | null
          description?: string | null
          discipline?: string | null
          distribution_list?: string | null
          drawing_reference?: string | null
          drawing_set_id?: string | null
          due_date?: string | null
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
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfis_drawing_set_id_fkey"
            columns: ["drawing_set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
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
      safety_incidents: {
        Row: {
          action_due_date: string | null
          corrective_actions: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          id: string
          incident_date: string | null
          incident_time: string | null
          incident_type: string | null
          injuries: string | null
          investigation_completed: boolean | null
          is_deleted: boolean
          location: string | null
          metadata: Json | null
          notes: string | null
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
          corrective_actions?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          incident_date?: string | null
          incident_time?: string | null
          incident_type?: string | null
          injuries?: string | null
          investigation_completed?: boolean | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
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
          corrective_actions?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          incident_date?: string | null
          incident_time?: string | null
          incident_type?: string | null
          injuries?: string | null
          investigation_completed?: boolean | null
          is_deleted?: boolean
          location?: string | null
          metadata?: Json | null
          notes?: string | null
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
      schedule_tasks: {
        Row: {
          assigned_to: string | null
          blockers: Json | null
          created_at: string | null
          crew_id: string | null
          crew_name: string | null
          dependencies: string | null
          duration: number | null
          end_date: string | null
          id: string
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
        }
        Insert: {
          assigned_to?: string | null
          blockers?: Json | null
          created_at?: string | null
          crew_id?: string | null
          crew_name?: string | null
          dependencies?: string | null
          duration?: number | null
          end_date?: string | null
          id?: string
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
        }
        Update: {
          assigned_to?: string | null
          blockers?: Json | null
          created_at?: string | null
          crew_id?: string | null
          crew_name?: string | null
          dependencies?: string | null
          duration?: number | null
          end_date?: string | null
          id?: string
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
        ]
      }
      scope_items: {
        Row: {
          added_by: string | null
          category: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
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
          storage_path: string | null
          updated_at: string | null
        }
        Insert: {
          added_by?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
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
          storage_path?: string | null
          updated_at?: string | null
        }
        Update: {
          added_by?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
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
          storage_path?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scope_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sov_items: {
        Row: {
          application_number: number | null
          cost_code: string | null
          cost_code_name: string | null
          created_at: string | null
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
          sov_id: string | null
          status: string | null
          submitted_date: string | null
          updated_at: string | null
        }
        Insert: {
          application_number?: number | null
          cost_code?: string | null
          cost_code_name?: string | null
          created_at?: string | null
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
          sov_id?: string | null
          status?: string | null
          submitted_date?: string | null
          updated_at?: string | null
        }
        Update: {
          application_number?: number | null
          cost_code?: string | null
          cost_code_name?: string | null
          created_at?: string | null
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
          sov_id?: string | null
          status?: string | null
          submitted_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sov_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
            foreignKeyName: "submittal_activity_submittal_id_fkey"
            columns: ["submittal_id"]
            isOneToOne: false
            referencedRelation: "submittals"
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
          ball_in_court: string | null
          created_at: string | null
          current_round_id: string | null
          days_in_review: number | null
          deleted_at: string | null
          discipline: string | null
          distributed_to: string | null
          drawing_set_ids: string[] | null
          external_id: string | null
          external_source: string | null
          file_url: string | null
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
          ball_in_court?: string | null
          created_at?: string | null
          current_round_id?: string | null
          days_in_review?: number | null
          deleted_at?: string | null
          discipline?: string | null
          distributed_to?: string | null
          drawing_set_ids?: string[] | null
          external_id?: string | null
          external_source?: string | null
          file_url?: string | null
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
          ball_in_court?: string | null
          created_at?: string | null
          current_round_id?: string | null
          days_in_review?: number | null
          deleted_at?: string | null
          discipline?: string | null
          distributed_to?: string | null
          drawing_set_ids?: string[] | null
          external_id?: string | null
          external_source?: string | null
          file_url?: string | null
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
          email: string | null
          id: string
          insurance_expiry: string | null
          insurance_provider: string | null
          is_preferred: boolean | null
          metadata: Json | null
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
          email?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_provider?: string | null
          is_preferred?: boolean | null
          metadata?: Json | null
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
          email?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_provider?: string | null
          is_preferred?: boolean | null
          metadata?: Json | null
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
        Relationships: []
      }
      warranties: {
        Row: {
          component_description: string | null
          coverage_percentage: number | null
          created_at: string | null
          exclusions: string | null
          expiration_date: string | null
          id: string
          is_active: boolean | null
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
          exclusions?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
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
          exclusions?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
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
          created_at: string | null
          crew: string | null
          deleted_at: string | null
          drawing_ids: string[] | null
          field_hours_actual: number | null
          field_hours_budget: number | null
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
          created_at?: string | null
          crew?: string | null
          deleted_at?: string | null
          drawing_ids?: string[] | null
          field_hours_actual?: number | null
          field_hours_budget?: number | null
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
          created_at?: string | null
          crew?: string | null
          deleted_at?: string | null
          drawing_ids?: string[] | null
          field_hours_actual?: number | null
          field_hours_budget?: number | null
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
      create_project: { Args: { project_data: Json }; Returns: Json }
      delete_drawing_set: { Args: { p_set_id: string }; Returns: number }
      soft_delete_project: { Args: { p_project_id: string }; Returns: undefined }
      escalate_rfi_sla: { Args: never; Returns: number }
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
      get_my_project_role: { Args: { p_project_id: string }; Returns: string }
      get_next_sequence_number: {
        Args: { p_project_id: string; p_record_type: string }
        Returns: number
      }
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
      reconcile_stuck_extractions: { Args: never; Returns: number }
      seed_project_handoff_items: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      set_for_drawing_is_locked: {
        Args: { p_drawing_id: string }
        Returns: boolean
      }
      set_for_zone_is_locked: { Args: { p_zone_id: string }; Returns: boolean }
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
      user_is_project_admin: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      user_is_system_admin: { Args: never; Returns: boolean }
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
  public: {
    Enums: {},
  },
} as const
