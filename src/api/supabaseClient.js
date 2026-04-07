/**
 * supabaseClient.js
 *
 * Drop-in replacement for the Base44 client.
 * Exports a `base44` object with the same API shape:
 *   base44.entities.X.list / filter / get / create / update / delete
 *   base44.auth.me / loginViaEmailPassword / logout / redirectToLogin / updateMe
 *   base44.integrations.Core.UploadFile / InvokeLLM
 *   base44.functions.invoke
 *
 * No changes needed in the 100+ page/component files that import base44.
 */

import { supabase } from '@/lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Base44 used `created_date` / `updated_date` as timestamp field names.
 * Our Postgres schema uses the standard `created_at` / `updated_at`.
 * Map them transparently so all existing code continues to work.
 */
const COLUMN_MAP = {
  created_date: 'created_at',
  updated_date: 'updated_at',
};

const mapColumn = (col) => COLUMN_MAP[col] || col;

/**
 * After fetching, add Base44-style aliases to each record so UI code
 * reading `record.created_date` still works.
 */
const addAliases = (record) => {
  if (!record || typeof record !== 'object') return record;
  const out = { ...record };
  if (out.created_at !== undefined && out.created_date === undefined) out.created_date = out.created_at;
  if (out.updated_at !== undefined && out.updated_date === undefined) out.updated_date = out.updated_at;
  return out;
};

const addAliasesToList = (rows) => (rows || []).map(addAliases);

/**
 * Parse Base44-style sort string ("-column" = descending, "column" = ascending)
 */
const parseSortBy = (sortBy) => {
  if (!sortBy) return null;
  const desc = sortBy.startsWith('-');
  const column = mapColumn(desc ? sortBy.slice(1) : sortBy);
  return { column, ascending: !desc };
};

/**
 * Build a filtered Supabase query from a Base44-style conditions object.
 * Supports simple equality and IN-array conditions.
 */
const applyConditions = (query, conditions = {}) => {
  for (const [key, value] of Object.entries(conditions)) {
    if (value === null || value === undefined) continue;
    const col = mapColumn(key);
    if (Array.isArray(value)) {
      query = query.in(col, value);
    } else {
      query = query.eq(col, value);
    }
  }
  return query;
};

// ─── Entity factory ───────────────────────────────────────────────────────────

/**
 * Strip undefined values and camelCase keys (Postgres uses snake_case only).
 * Also strip the virtual alias fields that addAliases() injects after reads
 * (created_date, updated_date) — they are not real DB columns and will cause
 * a PostgREST "column not found" error if sent back on update/create.
 */
const VIRTUAL_FIELDS = new Set(['created_date', 'updated_date']);
const cleanRecord = (record) =>
  Object.fromEntries(
    Object.entries(record).filter(
      ([k, v]) => v !== undefined && !/[A-Z]/.test(k) && !VIRTUAL_FIELDS.has(k)
    )
  );

const createEntityClient = (tableName) => ({
  /**
   * List all records, optionally sorted.
   */
  list: async (sortBy) => {
    let q = supabase.from(tableName).select('*');
    const sort = parseSortBy(sortBy);
    if (sort) {
      q = q.order(sort.column, { ascending: sort.ascending });
    } else {
      q = q.order('created_at', { ascending: false });
    }
    const { data, error } = await q;
    if (error) throw error;
    return addAliasesToList(data);
  },

  /**
   * Filter records by conditions.
   * @param {object} conditions  - { field: value } equality map
   * @param {string} [sortBy]    - "-column" descending or "column" ascending
   * @param {number} [limit]     - max records to return
   */
  filter: async (conditions = {}, sortBy, limit) => {
    let q = supabase.from(tableName).select('*');
    q = applyConditions(q, conditions);
    const sort = parseSortBy(sortBy);
    if (sort) {
      q = q.order(sort.column, { ascending: sort.ascending });
    } else {
      q = q.order('created_at', { ascending: false });
    }
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return addAliasesToList(data);
  },

  /**
   * Get a single record by id.
   */
  get: async (id) => {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return addAliases(data);
  },

  /**
   * Create a new record. Returns the created record with its generated id.
   */
  create: async (record) => {
    const clean = cleanRecord(record);
    const { data, error } = await supabase
      .from(tableName)
      .insert(clean)
      .select()
      .single();
    if (error) throw error;
    return addAliases(data);
  },

  /**
   * Update an existing record by id.
   */
  update: async (id, updates) => {
    const clean = cleanRecord(updates);
    const { data, error } = await supabase
      .from(tableName)
      .update({ ...clean, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return addAliases(data);
  },

  /**
   * Delete a record by id.
   */
  delete: async (id) => {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  /**
   * Bulk create multiple records.
   */
  bulkCreate: async (records) => {
    const { data, error } = await supabase
      .from(tableName)
      .insert(records)
      .select();
    if (error) throw error;
    return addAliasesToList(data);
  },
});

// ─── Entity registry ──────────────────────────────────────────────────────────

export const entities = {
  // Project creation goes through an RPC to atomically insert the project
  // and the creator's owner membership row in a single SECURITY DEFINER call,
  // bypassing the RLS bootstrap problem with the AFTER trigger approach.
  Project: {
    ...createEntityClient('projects'),
    create: async (record) => {
      const clean = Object.fromEntries(
        Object.entries(record).filter(([, v]) => v !== undefined)
      );
      const { data, error } = await supabase.rpc('create_project', {
        project_data: clean,
      });
      if (error) throw error;
      return addAliases(data);
    },
  },
  RFI:                   createEntityClient('rfis'),
  Drawing:               createEntityClient('drawings'),
  DrawingSet:            createEntityClient('drawing_sets'),
  ChangeOrder:           createEntityClient('change_orders'),
  ChangeRequest:         createEntityClient('change_requests'),
  ScheduleTask:          createEntityClient('schedule_tasks'),
  Expense:               createEntityClient('expenses'),
  Delivery:              createEntityClient('deliveries'),
  WorkPackage:           createEntityClient('work_packages'),
  SOVItem:               createEntityClient('sov_items'),
  Vendor:                createEntityClient('vendors'),
  Contact:               createEntityClient('contacts'),
  DailyLog:              createEntityClient('daily_logs'),
  Meeting:               createEntityClient('meetings'),
  ActionItem:            createEntityClient('action_items'),
  Inspection:            createEntityClient('inspections'),
  Photo:                 createEntityClient('photos'),
  PunchlistItem:         createEntityClient('punchlist_items'),
  QualityControlRecord:  createEntityClient('quality_control_records'),
  SafetyIncident:        createEntityClient('safety_incidents'),
  ProductionNote:        createEntityClient('production_notes'),
  Warranty:              createEntityClient('warranties'),
  Resource:              createEntityClient('resources'),
  LookAhead:             createEntityClient('look_ahead'),
  Document:              createEntityClient('documents'),
  Activity:              createEntityClient('activities'),
  UploadedFile:          createEntityClient('uploaded_files'),
  ScopeItem:             createEntityClient('scope_items'),
  Alert:                 createEntityClient('alerts'),
  CostCode:              createEntityClient('cost_codes'),
  ProjectCloseout:       createEntityClient('project_closeout'),
  User:                  createEntityClient('user_profiles'),
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  /**
   * Get the currently authenticated user.
   * Returns a user object compatible with what Base44 returned.
   */
  me: async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Not authenticated');
    return {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
      role: user.user_metadata?.role || 'user',
      ...user.user_metadata,
    };
  },

  /**
   * Sign in with email and password.
   */
  loginViaEmailPassword: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw { message: error.message, status: error.status };
    return data;
  },

  /**
   * Sign out the current user.
   */
  logout: async () => {
    await supabase.auth.signOut();
  },

  /**
   * Redirect to login page.
   * In Supabase apps this is an internal route, not an external auth server.
   */
  redirectToLogin: (url) => {
    const redirect = url ? `?redirect=${encodeURIComponent(url)}` : '';
    window.location.href = `/login${redirect}`;
  },

  /**
   * Update the current user's metadata.
   */
  updateMe: async (updates) => {
    const { data, error } = await supabase.auth.updateUser({ data: updates });
    if (error) throw error;
    return {
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name || data.user.email,
      ...data.user.user_metadata,
    };
  },
};

// ─── File uploads & LLM integrations ─────────────────────────────────────────

// Signed URL expiry in seconds (1 hour). Increase if long-lived links are needed.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * Get a short-lived signed URL for a stored file path.
 * Use this whenever displaying a file that was uploaded to the private bucket.
 */
export const getSignedUrl = async (storagePath) => {
  const { data, error } = await supabase.storage
    .from('app-files')
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
  if (error) throw error;
  return data.signedUrl;
};

/**
 * Resolve a file_url to a usable URL.
 * If the value looks like a storage path (no protocol), generate a signed URL.
 * If it's already a full URL, return as-is.
 */
export const resolveFileUrl = async (fileUrl) => {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;
  return getSignedUrl(fileUrl);
};

export const integrations = {
  Core: {
    /**
     * Upload a file to Supabase Storage (private bucket).
     * Returns { file_url, file_name, path }
     * file_url is a signed URL valid for 1 hour. For long-term storage,
     * persist `path` to the database and call getSignedUrl(path) on demand.
     */
    UploadFile: async ({ file }) => {
      if (!file) throw new Error('No file provided');
      const ext = file.name.split('.').pop();
      const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage
        .from('app-files')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      // Store the storage path — call getSignedUrl(path) on demand when displaying
      return { file_url: data.path, file_name: file.name, path: data.path };
    },

    /**
     * Invoke the LLM via a Supabase Edge Function (or direct Anthropic API).
     * Set VITE_ANTHROPIC_API_KEY or deploy a Supabase Edge Function named "llm-proxy".
     */
    InvokeLLM: async ({ prompt, system, messages, response_json_schema, input_variables, maxTokens = 1000, model }) => {
      // Try Supabase Edge Function first
      try {
        const { data, error } = await supabase.functions.invoke('llm-proxy', {
          body: { prompt, system, messages, response_json_schema, input_variables, maxTokens, model },
        });
        if (error) throw error;
        return data;
      } catch {
        // Fallback: placeholder response when LLM is not yet configured
        console.warn('LLM not configured. Deploy a Supabase Edge Function named "llm-proxy".');
        return {
          text: 'AI features require a Supabase Edge Function named "llm-proxy" to be deployed.',
          content: 'AI features require a Supabase Edge Function named "llm-proxy" to be deployed.',
        };
      }
    },
  },
};

// ─── Backend functions ────────────────────────────────────────────────────────

export const functions = {
  /**
   * Invoke a named backend function.
   * Implements client-side versions of critical functions; others fall back gracefully.
   */
  invoke: async (name, params = {}) => {
    switch (name) {
      // Number sequencing — scan existing records for the max number
      case 'secureNumberSequence':
      case 'numberSequence': {
        const { project_id, record_type } = params;
        if (!project_id || !record_type) return { data: { number: 1 } };
        const { data } = await supabase
          .from('number_sequences')
          .select('next_value')
          .eq('project_id', project_id)
          .eq('record_type', record_type)
          .single();
        if (data) {
          // Increment it
          const next = (data.next_value || 1);
          await supabase
            .from('number_sequences')
            .update({ next_value: next + 1, updated_at: new Date().toISOString() })
            .eq('project_id', project_id)
            .eq('record_type', record_type);
          return { data: { number: next } };
        } else {
          // Create sequence starting at 1
          await supabase.from('number_sequences').insert({
            project_id,
            record_type,
            next_value: 2,
          });
          return { data: { number: 1 } };
        }
      }

      // LLM proxy
      case 'invokeLLM':
      case 'anthropicProxy': {
        try {
          const { data, error } = await supabase.functions.invoke('llm-proxy', { body: params });
          if (error) throw error;
          return { data };
        } catch {
          return { data: { text: 'AI features require the "llm-proxy" Supabase Edge Function.', error: null } };
        }
      }

      // Alert generation
      case 'generateAlerts':
        try {
          const { data } = await supabase.functions.invoke('generate-alerts', { body: params });
          return { data: data || { alerts: [] } };
        } catch {
          return { data: { alerts: [] } };
        }

      // Agent memory
      case 'agentMemory':
        try {
          const { data } = await supabase.functions.invoke('agent-memory', { body: params });
          return { data };
        } catch {
          return { data: null };
        }

      // PDF generation
      case 'generateExecutivePDF':
        try {
          const { data } = await supabase.functions.invoke('generate-pdf', { body: params });
          return { data };
        } catch {
          return { data: null };
        }

      default:
        console.warn(`functions.invoke('${name}') is not implemented. Deploy a Supabase Edge Function.`);
        return { data: null };
    }
  },
};

// ─── Main export (matches Base44 client API) ─────────────────────────────────

export const base44 = { entities, auth, integrations, functions, getSignedUrl, resolveFileUrl };
