/**
 * Which react-query failures Sentry should treat as crashes.
 *
 * Sentry JAVASCRIPT-REACT-2D was a database guard ("Held or production-started
 * pieces cannot be archived", P0001) rejecting a user action while the screen
 * already showed a friendly toast. Reported as a crash, that expected outcome
 * buried real bugs. This module decides, in one place, for the two react-query
 * cache hooks in src/lib/query-client.ts, whether a failure is one of those
 * expected, user-explained outcomes.
 *
 * A failure is "expected" only when ALL of these hold. Anything else, or any
 * doubt, keeps it reported as an error:
 *   1. it came from a mutation (queries are always reported);
 *   2. the raw rejection is an Error: the same object Sentry marks as captured,
 *      so an uncaught mutateAsync can't re-report it via unhandledrejection;
 *   3. the mutation has its own `options.onError`, i.e. it explains the failure
 *      (`meta.suppressGlobalErrorToast` does not count);
 *   4. the mutation opted in through `meta.expectedErrors` (see reportingMeta);
 *   5. the SQLSTATE is in DOWNGRADE_ELIGIBLE_CODES (P0001 only; no rule or meta
 *      can downgrade an RLS denial, an official-number collision, a timeout...);
 *   6. the message, minus PostgREST's " — details — hint — code" tail and a
 *      "[table.op] " prefix, matches a ^-anchored rule the mutation listed.
 *
 * An expected failure is still sent to Sentry, at info level with
 * expected=true and its own fingerprint, so every guard stays countable.
 *
 * Pure: no Sentry, React or TanStack imports.
 */
import { postgrestErrorCode } from "@/lib/postgrestErrors";

export type ExpectedErrorRule = Readonly<{
  /** Stable id: the `expected_rule` tag and part of the fingerprint. */
  id: string;
  code: "P0001";
  /** Tested against the normalized message head. Must start with `^`. */
  message: RegExp;
  /** The verbatim RAISE text. Used only by tests. */
  example: string;
}>;

/** The ceiling: no rule and no meta can downgrade any other SQLSTATE. */
export const DOWNGRADE_ELIGIBLE_CODES: ReadonlySet<string> = new Set(["P0001"]);

function rule(id: string, message: RegExp, example: string): ExpectedErrorRule {
  const entry: ExpectedErrorRule = { id, code: "P0001", message, example };
  return Object.freeze(entry);
}

/**
 * archive_piece_lots guards
 * (supabase/migrations/20260720213000_archive_canonical_pieces.sql), shown by
 * presentPieceControlError. The register pre-filters the held and split cases
 * (archiveEligibility.ts), so a hit on those two now means a stale row.
 * Deliberately absent, so they stay error-level:
 *   - "All selected pieces must be active and belong to the same project",
 *     which can be a cache-invalidation bug;
 *   - "Pieces with production history cannot be archived". Consistent data
 *     never reaches it: advance_piece_station writes a completion and moves the
 *     piece off not_started onto a station in one transaction, so the
 *     held-or-started guard fires first, and split child lots with copied
 *     completions hit the split-lot guard. A hit means completions and the
 *     piece's lifecycle/station disagree: drift, not a user outcome.
 */
export const PIECE_ARCHIVE_EXPECTED_ERRORS: readonly ExpectedErrorRule[] = Object.freeze([
  rule(
    "piece-archive.held-or-started",
    /^Held or production-started pieces cannot be archived$/,
    "Held or production-started pieces cannot be archived",
  ),
  rule(
    "piece-archive.split-lot",
    /^Split piece lots cannot be archived; preserve the complete lot topology$/,
    "Split piece lots cannot be archived; preserve the complete lot topology",
  ),
  rule(
    "piece-archive.canonical-release",
    /^Pieces in a canonically released work package cannot be archived$/,
    "Pieces in a canonically released work package cannot be archived",
  ),
]);

/**
 * set_piece_control_mode readiness guards
 * (supabase/migrations/20260718070000_piece_control_slice7.sql). The confirm
 * buttons don't pre-check readiness; the server is the gate by design.
 */
export const PIECE_MODE_EXPECTED_ERRORS: readonly ExpectedErrorRule[] = Object.freeze([
  rule(
    "piece-mode.pilot-blocked",
    /^Pilot transition blocked: /,
    'Pilot transition blocked: ["No active actionable canonical piece scope"]',
  ),
  rule(
    "piece-mode.live-blocked",
    /^Live transition blocked: /,
    'Live transition blocked: ["Resolve missing material mappings before live mode"]',
  ),
]);

/** The reviewed catalogue. A new rule needs friendly text in its presenter. */
export const EXPECTED_ERROR_RULES: readonly ExpectedErrorRule[] = Object.freeze([
  ...PIECE_ARCHIVE_EXPECTED_ERRORS,
  ...PIECE_MODE_EXPECTED_ERRORS,
]);

export type ReportingSource = "query" | "mutation";

/** Where `action` came from. `none` lists the mutations still to label. */
export type ActionSource = "meta" | "key" | "db" | "none";

export type UnexpectedReason =
  | "query-always-reported"
  | "raw-not-error"
  | "no-local-handler"
  | "not-opted-in"
  | "no-code"
  | "code-not-eligible"
  | "no-rule-match";

export type ReportedErrorClassification =
  | Readonly<{ verdict: "expected"; reason: "matched-rule"; ruleId: string; code: string }>
  | Readonly<{ verdict: "unexpected"; reason: UnexpectedReason; code: string }>;

export type ClassifyContext = Readonly<{
  source: ReportingSource;
  /** The raw rejection is an Error (the object captureException marks). */
  rawIsError: boolean;
  /** `mutation.options.onError` exists. Per-call handlers are invisible here. */
  hasLocalHandler: boolean;
  /** `mutation.meta.expectedErrors`: untyped at runtime, validated here. */
  expectedErrors?: unknown;
}>;

/** `meta` for useMutation: a stable action name and an optional opt-in bundle. */
export type ReportingMeta = {
  action: string;
  expectedErrors?: readonly ExpectedErrorRule[];
};

export function reportingMeta(
  action: string,
  expectedErrors?: readonly ExpectedErrorRule[],
): ReportingMeta {
  return expectedErrors ? { action, expectedErrors } : { action };
}

export type ReportedAction = Readonly<{ action: string; actionSource: ActionSource }>;

// Sentry caps tag values at 200 characters.
const MAX_TAG_LENGTH = 200;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A low-cardinality name part: not a UUID, number, object, email or free text. */
function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value) && !UUID.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function actionFromMeta(meta: unknown): string | null {
  const action = asRecord(meta)?.action;
  if (typeof action !== "string") return null;
  const trimmed = action.trim();
  return trimmed ? trimmed.slice(0, MAX_TAG_LENGTH) : null;
}

function actionFromKey(key: unknown): string | null {
  if (!Array.isArray(key) || key.length === 0) return null;
  const parts = (key as readonly unknown[]).map((part) => (isIdentifier(part) ? part : "*"));
  if (parts.every((part) => part === "*")) return null;
  return parts.join(".").slice(0, MAX_TAG_LENGTH);
}

/** SupabaseOperationError (src/api/client/errors.ts) carries table/operation as data. */
function actionFromDbError(error: unknown): string | null {
  if (!(error instanceof Error) || error.name !== "SupabaseOperationError") return null;
  const { table, operation } = error as Error & { table?: unknown; operation?: unknown };
  return isIdentifier(table) && isIdentifier(operation) ? `db:${table}.${operation}` : null;
}

/**
 * Name the failing action: `meta.action`, else the key (id-like parts masked
 * as `*`), else `db:<table>.<operation>` from a SupabaseOperationError, else
 * `unnamed`.
 */
export function resolveReportedAction(
  input: Readonly<{ meta?: unknown; mutationKey?: unknown; error?: unknown }>,
): ReportedAction {
  const fromMeta = actionFromMeta(input.meta);
  if (fromMeta) return { action: fromMeta, actionSource: "meta" };
  const fromKey = actionFromKey(input.mutationKey);
  if (fromKey) return { action: fromKey, actionSource: "key" };
  const fromDb = actionFromDbError(input.error);
  if (fromDb) return { action: fromDb, actionSource: "db" };
  return { action: "unnamed", actionSource: "none" };
}

/** Queries: `meta.action`, else `queryKey[0]` when it is an identifier. */
export function queryReportingAction(
  query: Readonly<{ meta?: unknown; queryKey?: unknown }>,
): ReportedAction {
  const head = Array.isArray(query.queryKey)
    ? (query.queryKey as readonly unknown[])[0]
    : undefined;
  return resolveReportedAction({
    meta: query.meta,
    mutationKey: isIdentifier(head) ? [head] : undefined,
  });
}

export type MutationReportingSubject = Readonly<{
  meta?: unknown;
  options: Readonly<{ mutationKey?: unknown; onError?: unknown }>;
}>;

export type MutationReportingInput = ReportedAction &
  Readonly<{ hasLocalHandler: boolean; expectedErrors: unknown }>;

export function mutationReportingInput(
  mutation: MutationReportingSubject,
  error?: unknown,
): MutationReportingInput {
  const { action, actionSource } = resolveReportedAction({
    meta: mutation.meta,
    mutationKey: mutation.options.mutationKey,
    error,
  });
  return {
    action,
    actionSource,
    hasLocalHandler: typeof mutation.options.onError === "function",
    expectedErrors: asRecord(mutation.meta)?.expectedErrors,
  };
}

const TAIL_SEPARATOR = " — ";
const TABLE_OP_PREFIX = /^\[[A-Za-z0-9_]+\.[A-Za-z0-9_]+\] /;

/**
 * The guard's own text. postgrestErrorMessage joins message — details — hint —
 * code, keeping only non-blank strings; undo that from the end, and only for
 * parts the error actually carries, so a message that itself contains " — " is
 * never cut down into a $-anchored match. Then drop a "[table.op] " prefix.
 */
function messageHead(error: unknown): string {
  const record = asRecord(error);
  const message = error instanceof Error ? error.message : record?.message;
  let head = typeof message === "string" ? message : "";
  for (const key of ["code", "hint", "details"] as const) {
    const part = record?.[key];
    if (typeof part !== "string" || part.trim().length === 0) continue;
    const suffix = `${TAIL_SEPARATOR}${part}`;
    if (head.endsWith(suffix)) head = head.slice(0, head.length - suffix.length);
  }
  return head.replace(TABLE_OP_PREFIX, "");
}

type UsableRule = Readonly<{ id: string; pattern: RegExp }>;

/** A rule counts only if it is well-formed, anchored and inside the ceiling. */
function usableRule(candidate: unknown, code: string): UsableRule | null {
  const record = asRecord(candidate);
  if (!record) return null;
  const { id, code: ruleCode, message } = record;
  if (typeof id !== "string" || id.length === 0) return null;
  if (ruleCode !== code || !DOWNGRADE_ELIGIBLE_CODES.has(code)) return null;
  if (!(message instanceof RegExp)) return null;
  // Whole-pattern anchoring: no `|` escape hatch, no multiline `^`, and no
  // stateful g/y lastIndex.
  if (!message.source.startsWith("^") || message.source.includes("|")) return null;
  if (message.global || message.sticky || message.multiline) return null;
  return { id, pattern: message };
}

/** Checks run in order and fail closed; see the module comment. */
export function classifyReportedError(
  error: unknown,
  ctx: ClassifyContext,
): ReportedErrorClassification {
  const code = postgrestErrorCode(error);
  const unexpected = (reason: UnexpectedReason): ReportedErrorClassification => ({
    verdict: "unexpected",
    reason,
    code,
  });

  if (ctx.source !== "mutation") return unexpected("query-always-reported");
  if (ctx.rawIsError !== true) return unexpected("raw-not-error");
  if (ctx.hasLocalHandler !== true) return unexpected("no-local-handler");
  const optedIn = ctx.expectedErrors;
  if (!Array.isArray(optedIn) || optedIn.length === 0) return unexpected("not-opted-in");
  if (!code) return unexpected("no-code");
  if (!DOWNGRADE_ELIGIBLE_CODES.has(code)) return unexpected("code-not-eligible");

  const head = messageHead(error);
  for (const candidate of optedIn as readonly unknown[]) {
    const usable = usableRule(candidate, code);
    if (usable && usable.pattern.test(head)) {
      return { verdict: "expected", reason: "matched-rule", ruleId: usable.id, code };
    }
  }
  return unexpected("no-rule-match");
}
