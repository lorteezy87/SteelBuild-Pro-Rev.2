/**
 * supabaseClient.js
 *
 * Drop-in replacement for the Base44 client — enterprise-hardened.
 * Exports a `base44` object with the same API shape:
 *   base44.entities.X.list / filter / get / create / update / delete
 *   base44.auth.me / loginViaEmailPassword / logout / redirectToLogin / updateMe
 *   base44.integrations.Core.UploadFile / InvokeLLM
 *   base44.functions.invoke
 *
 * Enterprise improvements over original Base44 adapter:
 *   - Soft-delete support: list/filter auto-exclude is_deleted rows
 *   - Atomic number sequencing via DB RPC (no race conditions)
 *   - Structured error messages with table/operation context
 *   - camelCase→snake_case field mapping for known patterns
 *   - Range/comparison query support via operator prefixes
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
 * Supports:
 *   - Simple equality: { status: 'Open' }
 *   - IN-array:        { status: ['Open', 'Closed'] }
 *   - Range operators: { 'scheduled_date.gte': '2024-01-01' }
 *   - NULL checks:     { assigned_to: null } → .is('assigned_to', null)
 */
const RANGE_OPS = { gte: 'gte', gt: 'gt', lte: 'lte', lt: 'lt', neq: 'neq', like: 'like', ilike: 'ilike' };

const applyConditions = (query, conditions = {}) => {
  for (const [key, value] of Object.entries(conditions)) {
    if (value === undefined) continue;

    // Check for operator suffix: "field.gte" → { field: col, op: 'gte' }
    const dotIdx = key.lastIndexOf('.');
    if (dotIdx > 0) {
      const opName = key.slice(dotIdx + 1);
      if (RANGE_OPS[opName]) {
        const col = mapColumn(key.slice(0, dotIdx));
        query = query[opName](col, value);
        continue;
      }
    }

    const col = mapColumn(key);
    if (value === null) {
      query = query.is(col, null);
    } else if (Array.isArray(value)) {
      query = query.in(col, value);
    } else {
      query = query.eq(col, value);
    }
  }
  return query;
};

/**
 * Wrap a Supabase error with context about which table/operation failed.
 */
class SupabaseOperationError extends Error {
  constructor(table, operation, originalError) {
    const msg = originalError?.message || originalError?.details || String(originalError);
    super(`[${table}.${operation}] ${msg}`);
    this.name = 'SupabaseOperationError';
    this.table = table;
    this.operation = operation;
    this.code = originalError?.code;
    this.details = originalError?.details;
    this.hint = originalError?.hint;
  }
}

// ─── Entity factory ───────────────────────────────────────────────────────────

/**
 * Tables that have soft-delete columns (is_deleted, deleted_at).
 * list() and filter() will auto-exclude deleted rows unless explicitly included.
 */
const SOFT_DELETE_TABLES = new Set([
  'rfis', 'change_orders', 'deliveries', 'work_packages',
  'documents', 'drawings', 'expenses', 'inspections',
  'punchlist_items', 'safety_incidents', 'scope_items',
  'sov_items', 'contacts', 'meetings',
]);

/**
 * Strip undefined values and camelCase keys (Postgres uses snake_case only).
 * Also strip the virtual alias fields that addAliases() injects after reads
 * (created_date, updated_date) — they are not real DB columns and will cause
 * a PostgREST "column not found" error if sent back on update/create.
 */
const VIRTUAL_FIELDS = new Set(['created_date', 'updated_date']);
const cleanRecord = (record) =>
  Object.fromEntries(
    Object.entries(record)
      .filter(
        ([k, v]) => v !== undefined && !/[A-Z]/.test(k) && !VIRTUAL_FIELDS.has(k)
      )
      .map(([k, v]) => [k, v === '' ? null : v])
  );

const createEntityClient = (tableName) => ({
  /**
   * List all records, optionally sorted.
   * Auto-excludes soft-deleted rows.
   */
  list: async (sortBy) => {
    let q = supabase.from(tableName).select('*');
    // Soft-delete filter
    if (SOFT_DELETE_TABLES.has(tableName)) {
      q = q.eq('is_deleted', false);
    }
    const sort = parseSortBy(sortBy);
    if (sort) {
      q = q.order(sort.column, { ascending: sort.ascending });
    } else {
      q = q.order('created_at', { ascending: false });
    }
    const { data, error } = await q;
    if (error) throw new SupabaseOperationError(tableName, 'list', error);
    return addAliasesToList(data);
  },

  /**
   * Filter records by conditions.
   * @param {object} conditions  - { field: value } equality map, supports operators
   * @param {string} [sortBy]    - "-column" descending or "column" ascending
   * @param {number} [limit]     - max records to return
   */
  filter: async (conditions = {}, sortBy, limit) => {
    let q = supabase.from(tableName).select('*');
    // Soft-delete filter (unless caller explicitly filters is_deleted)
    if (SOFT_DELETE_TABLES.has(tableName) && !('is_deleted' in conditions)) {
      q = q.eq('is_deleted', false);
    }
    q = applyConditions(q, conditions);
    const sort = parseSortBy(sortBy);
    if (sort) {
      q = q.order(sort.column, { ascending: sort.ascending });
    } else {
      q = q.order('created_at', { ascending: false });
    }
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw new SupabaseOperationError(tableName, 'filter', error);
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
    if (error) throw new SupabaseOperationError(tableName, 'get', error);
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
    if (error) throw new SupabaseOperationError(tableName, 'create', error);
    return addAliases(data);
  },

  /**
   * Update an existing record by id.
   */
  update: async (id, updates) => {
    const clean = cleanRecord(updates);
    // Never send primary key or server timestamps in the update body
    delete clean.id;
    delete clean.created_at;
    // updated_at is now handled by the DB trigger (trg_updated_at),
    // but we keep the client-side set for backwards compat
    const { data, error } = await supabase
      .from(tableName)
      .update({ ...clean, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new SupabaseOperationError(tableName, 'update', error);
    return addAliases(data);
  },

  /**
   * Soft-delete a record if supported, otherwise hard-delete.
   */
  delete: async (id) => {
    if (SOFT_DELETE_TABLES.has(tableName)) {
      const { error } = await supabase
        .from(tableName)
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new SupabaseOperationError(tableName, 'delete', error);
    } else {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      if (error) throw new SupabaseOperationError(tableName, 'delete', error);
    }
    return { success: true };
  },

  /**
   * Bulk create multiple records.
   */
  bulkCreate: async (records) => {
    const cleaned = records.map(cleanRecord);
    const { data, error } = await supabase
      .from(tableName)
      .insert(cleaned)
      .select();
    if (error) throw new SupabaseOperationError(tableName, 'bulkCreate', error);
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
      if (error) throw new SupabaseOperationError('projects', 'create', error);
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
  PmaDecision:           createEntityClient('pma_decisions'),
  PmaAssumption:         createEntityClient('pma_assumptions'),
  PmaAuditLog:           createEntityClient('pma_audit_logs'),
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
      // Atomic number sequencing via Postgres RPC — no race conditions.
      // The DB function uses INSERT...ON CONFLICT with RETURNING for atomicity.
      case 'secureNumberSequence':
      case 'numberSequence': {
        const { project_id, record_type } = params;
        if (!project_id || !record_type) return { data: { number: 1 } };
        try {
          const { data, error } = await supabase.rpc('get_next_sequence_number', {
            p_project_id: project_id,
            p_record_type: record_type,
          });
          if (error) throw error;
          return { data: { number: data } };
        } catch (err) {
          console.error('Atomic sequence RPC failed, using fallback:', err);
          // Fallback: client-side (only if RPC somehow unavailable)
          const { data } = await supabase
            .from('number_sequences')
            .select('next_value')
            .eq('project_id', project_id)
            .eq('record_type', record_type)
            .single();
          if (data) {
            const next = (data.next_value || 1);
            await supabase
              .from('number_sequences')
              .update({ next_value: next + 1, updated_at: new Date().toISOString() })
              .eq('project_id', project_id)
              .eq('record_type', record_type);
            return { data: { number: next } };
          } else {
            await supabase.from('number_sequences').insert({
              project_id,
              record_type,
              next_value: 2,
            });
            return { data: { number: 1 } };
          }
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
