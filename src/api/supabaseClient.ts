/**
 * supabaseClient.ts
 *
 * The app's Supabase-backed data layer. Exports the surfaces directly as
 * named values — import exactly what you need:
 *   entities.X.list / filter / get / create / update / delete
 *   auth.me / loginViaEmailPassword / logout / redirectToLogin / updateMe
 *   integrations.Core.UploadFile / InvokeLLM
 *   functions.invoke
 *   getSignedUrl / resolveFileUrl
 *
 * Capabilities:
 *   - Soft-delete support: list/filter auto-exclude is_deleted rows
 *   - Atomic number sequencing via DB RPC (no race conditions)
 *   - Structured error messages with table/operation context
 *   - camelCase→snake_case field mapping for known patterns
 *   - Range/comparison query support via operator prefixes
 *
 * ── Structure ────────────────────────────────────────────────────────────────
 * This module is a thin re-export BARREL. The implementation is split by concern
 * under `./client/`, but every `import ... from "@/api/supabaseClient"` continues
 * to resolve unchanged:
 *   ./client/supabaseTypes  — all public + internal type defs
 *   ./client/fieldMapping   — COLUMN_MAP, aliases, JSONB normalisation, cleanRecord
 *   ./client/queryHelpers   — parseSortBy, RANGE_OPS, applyConditions
 *   ./client/errors         — SupabaseOperationError
 *   ./client/softDelete     — SOFT_DELETE_TABLES, PROJECT_SCOPED_TABLES, scoping
 *   ./client/entityClient   — createEntityClient factory, LIST_ROW_CAP, chunking
 *   ./client/entities       — the full entity registry + custom wrappers
 *   ./client/auth           — auth surface + privilege guards
 *   ./client/storage        — getSignedUrl, resolveFileUrl, file-trust boundary
 *   ./client/uploads        — Core.UploadFile
 *   ./client/llm            — Core.InvokeLLM
 *   ./client/integrations   — composes integrations.Core
 *   ./client/functions      — functions.invoke dispatcher (incl. number sequencing)
 */

// ─── Value re-exports (public runtime surface) ────────────────────────────────
export { entities } from './client/entities';
export { auth } from './client/auth';
export { integrations } from './client/integrations';
export { functions } from './client/functions';
export { getSignedUrl, resolveFileUrl } from './client/storage';
export { LIST_ROW_CAP } from './client/entityClient';

// ─── Type re-exports (public type surface) ────────────────────────────────────
export type {
  TableName,
  Row,
  Insert,
  Update,
  RowWithAliases,
  Conditions,
  EntityClient,
  AuthMeResult,
  UploadFileArgs,
  UploadFileResult,
  InvokeLLMArgs,
  InvokeLLMResult,
  FunctionInvokeResult,
} from './client/supabaseTypes';
export type { Entities, EntityKey } from './client/entities';
