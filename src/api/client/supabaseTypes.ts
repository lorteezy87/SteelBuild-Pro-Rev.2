/**
 * supabaseTypes.ts
 *
 * All public + internal TypeScript type definitions for the Supabase data
 * layer. Extracted verbatim from supabaseClient.ts so the barrel can re-export
 * the identical type surface. No runtime code lives here.
 */

import type { Database } from '@/types/supabase';
import type { UploadWorkflow } from '@/lib/uploadValidation';

// ─── Type helpers (DB row shapes) ─────────────────────────────────────────────

type Tables = Database['public']['Tables'];
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]['Row'];
export type Insert<T extends TableName> = Tables[T]['Insert'];
export type Update<T extends TableName> = Tables[T]['Update'];

/**
 * Reads pass through addAliases() which injects created_date / updated_date
 * mirrors of created_at / updated_at. The DB schema does not expose those
 * columns, but every call site reads them, so the public row type widens
 * to include them.
 */
export type RowWithAliases<T extends TableName> = Row<T> & {
  created_date?: string | null;
  updated_date?: string | null;
};

export type Conditions = Record<string, unknown>;

export type EntityClient<T extends TableName> = {
  list: (sortBy?: string) => Promise<Array<RowWithAliases<T>>>;
  /** Like list() but PAGINATES to completeness — no silent DEFAULT_LIST_LIMIT
   *  cap. For portfolio/dashboard reads that span all projects and can outgrow
   *  the cap as a tenant grows (CommandCenter / AIInsights). */
  listAll: (sortBy?: string) => Promise<Array<RowWithAliases<T>>>;
  filter: (conditions?: Conditions, sortBy?: string, limit?: number) => Promise<Array<RowWithAliases<T>>>;
  get: (id: string) => Promise<RowWithAliases<T>>;
  create: (record: Insert<T>) => Promise<RowWithAliases<T>>;
  update: (id: string, updates: Update<T>) => Promise<RowWithAliases<T>>;
  delete: (id: string) => Promise<{ success: true }>;
  bulkCreate: (records: Insert<T>[]) => Promise<Array<RowWithAliases<T>>>;
  /**
   * Apply the SAME `updates` patch to many rows in ONE UPDATE per chunk
   * (≤500 ids) via `.in('id', chunk)`, instead of N single-row round-trips.
   * Same cleanRecord + updated_at treatment as update(); returns the aliased
   * rows across all chunks. RLS still applies per row, so a row the caller
   * can't touch is silently skipped (not returned) rather than erroring the
   * batch. Use ONLY when the payload is identical for every id.
   */
  bulkUpdate: (ids: string[], updates: Update<T>) => Promise<Array<RowWithAliases<T>>>;
  /**
   * Delete many rows honoring the entity's delete() semantics (soft-delete
   * flag flip for SOFT_DELETE_TABLES, hard DELETE otherwise) in ONE op per
   * chunk (≤500 ids) via `.in('id', chunk)`. RLS still applies per row.
   */
  bulkDelete: (ids: string[]) => Promise<{ success: true }>;
};

export type AuthMeResult = {
  id: string;
  email: string | undefined;
  full_name: string;
  role: string;
  [key: string]: unknown;
};

export type UploadFileArgs = {
  file: File;
  /**
   * Optional workflow key (see src/lib/uploadValidation.ts). When supplied, the
   * tighter per-workflow extension allowlist + size cap is enforced. When
   * omitted, the fail-closed `default` backstop still applies (blocks dangerous
   * executable/script extensions and caps size) so no upload path is unguarded.
   */
  workflow?: UploadWorkflow;
};
export type UploadFileResult = { file_url: string; file_name: string; path: string };

export type InvokeLLMArgs = {
  prompt?: string;
  system?: string;
  messages?: Array<{ role: string; content: unknown }>;
  response_json_schema?: unknown;
  input_variables?: Record<string, unknown>;
  maxTokens?: number;
  model?: string;
  file_urls?: string[];
  files?: unknown[];
  tools?: Array<{ name: string; [key: string]: unknown }>;
  tool_choice?: unknown;
  temperature?: number;
  provider?: string;
  /**
   * LLM gateway routing key. Optional — when omitted the edge function
   * falls back to the "general" routing target. Set this to one of the
   * keys in `supabase/functions/llm-proxy/router.ts` so spend/latency
   * telemetry is grouped correctly. Common values:
   *   "drawing-analysis" "revision-compare" "sheet-extraction"
   *   "drawing-link-suggest" "shipping-ticket-import" "rfi-log-import"
   *   "photo-ocr"
   * Explicit `provider`/`model` still override the router decision.
   */
  useCase?: string;
  /** Optional, for telemetry only — surfaces per-project cost. */
  project_id?: string;
};

export type InvokeLLMResult = {
  text?: string;
  content?: string | unknown;
  tool_use?: { name: string; input: unknown } | null;
  raw?: unknown;
  protocol_version?: number;
  error?: string;
};

export type FunctionInvokeResult = { data: unknown };
