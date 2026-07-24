/**
 * drawingEnums.ts — Single source of truth for Drawing / DrawingSet /
 * DrawingActivity enum values. These MUST match the CHECK constraints
 * in Supabase (project kjrwqagyeswwoxpjkcko). Drift between the UI and
 * the DB silently fails the INSERT and the user loses their save.
 *
 * Verified against pg_constraint on 2026-05-04 (migration 077).
 * Canonical 7-stage flow: Not Started → IFA → OFA → BFA → OFS → IFC →
 * Released. Legacy pre-077 stage names were removed by migration 077.
 *
 * Usage:
 *   import { assertDrawingStage, coerceDrawingStage } from "@/lib/drawingEnums";
 *   const safeStage = coerceDrawingStage(form.stage);        // silent fallback
 *   assertDrawingStage(payload.stage);                        // throw before insert
 */

// ── Allowed values ──────────────────────────────────────────────────────────

export const DRAWING_STAGES = [
  "Not Started",
  "IFA",
  "OFA",
  "BFA",
  "OFS",
  "IFC",
  "Released",
] as const;

export type DrawingStage = (typeof DRAWING_STAGES)[number];

export const DRAWING_UPLOAD_STATUSES = [
  "Uploading",
  "Uploaded",
  "Failed",
] as const;

export type DrawingUploadStatus = (typeof DRAWING_UPLOAD_STATUSES)[number];

export const DRAWING_AI_EXTRACTION_STATUSES = [
  "Pending",
  "Extracting",
  "Processed",
  "NeedsReview",
  "Failed",
] as const;

export type DrawingAiExtractionStatus = (typeof DRAWING_AI_EXTRACTION_STATUSES)[number];

export const DRAWING_SET_APPROVAL_STATUSES = [
  "approved",
  "rejected",
  "superseded",
  "pending_review",
] as const;

export type DrawingSetApprovalStatus = (typeof DRAWING_SET_APPROVAL_STATUSES)[number];

export const DRAWING_ACTIVITY_EVENT_TYPES = [
  "created",
  "stage_changed",
  "revision_changed",
  "approval_changed",
  "deleted",
  "restored",
  "ai_status_changed",
  "superseded",
] as const;

export type DrawingActivityEventType = (typeof DRAWING_ACTIVITY_EVENT_TYPES)[number];

// ── Guard factory ──────────────────────────────────────────────────────────

type GuardOptions<T extends string> = {
  nullable?: boolean;
  coerceAliases?: Record<string, T | null>;
};

function makeGuard<T extends string>(
  label: string,
  allowed: readonly T[],
  { nullable = false, coerceAliases = {} }: GuardOptions<T> = {},
) {
  const set = new Set<string>(allowed);
  const isValid = (v: unknown): boolean => (v == null ? nullable : set.has(String(v)));

  const assert = (value: unknown, context = ""): T | null => {
    if (isValid(value)) return (value as T | null) ?? null;
    const where = context ? ` (${context})` : "";
    throw new Error(
      `Invalid ${label}${where}: "${String(value)}" is not one of [${allowed.join(", ")}]`,
    );
  };

  const coerce = (value: unknown, fallback: T | null = null): T | null => {
    if (value == null) return nullable ? null : fallback;
    if (set.has(String(value))) return value as T;
    // Case-insensitive exact match (common typo path)
    const ci = allowed.find((a) => a.toLowerCase() === String(value).toLowerCase());
    if (ci) return ci;
    // Caller-supplied alias map
    const alias = coerceAliases[String(value).toLowerCase()];
    if (alias && set.has(alias)) return alias;
    return fallback;
  };

  return { isValid, assert, coerce };
}

// ── Public guards ──────────────────────────────────────────────────────────

const stageGuard = makeGuard("drawing stage", DRAWING_STAGES, {
  coerceAliases: {
    issued: "IFC",
    issuedforconstruction: "IFC",
    issued_for_construction: "IFC",
    notstarted: "Not Started",
    not_started: "Not Started",
    void: null, // handled via is_superseded=true, not a stage value
  },
});

const uploadGuard = makeGuard("upload_status", DRAWING_UPLOAD_STATUSES, {
  coerceAliases: {
    complete: "Uploaded",
    ready: "Uploaded",
    ok: "Uploaded",
    done: "Uploaded",
    error: "Failed",
  },
});

const aiGuard = makeGuard("ai_extraction_status", DRAWING_AI_EXTRACTION_STATUSES, {
  nullable: true,
  coerceAliases: {
    needs_review: "NeedsReview",
    needsreview: "NeedsReview",
    complete: "Processed",
    done: "Processed",
  },
});

const setApprovalGuard = makeGuard("set_approval_status", DRAWING_SET_APPROVAL_STATUSES, {
  nullable: true,
  coerceAliases: {
    approved: "approved",
    rejected: "rejected",
    superseded: "superseded",
    pending: "pending_review",
    pending_review: "pending_review",
    voided: "superseded",
    void: "superseded",
  },
});

const activityEventGuard = makeGuard("drawing_activity.event_type", DRAWING_ACTIVITY_EVENT_TYPES);

export const isValidDrawingStage = stageGuard.isValid;
export const assertDrawingStage = stageGuard.assert;
export const coerceDrawingStage = stageGuard.coerce;

export const isValidUploadStatus = uploadGuard.isValid;
export const assertUploadStatus = uploadGuard.assert;
export const coerceUploadStatus = uploadGuard.coerce;

export const isValidAiExtractionStatus = aiGuard.isValid;
export const assertAiExtractionStatus = aiGuard.assert;
export const coerceAiExtractionStatus = aiGuard.coerce;

export const isValidSetApprovalStatus = setApprovalGuard.isValid;
export const assertSetApprovalStatus = setApprovalGuard.assert;
export const coerceSetApprovalStatus = setApprovalGuard.coerce;

export const isValidActivityEventType = activityEventGuard.isValid;
export const assertActivityEventType = activityEventGuard.assert;

// ── Helper: sanitize a full drawing payload before INSERT/UPDATE ───────────

export type DrawingPayload = Record<string, unknown> & {
  stage?: unknown;
  upload_status?: unknown;
  ai_extraction_status?: unknown;
};

export type DrawingSetPayload = Record<string, unknown> & {
  set_approval_status?: unknown;
};

/**
 * Pass in a drawing record and get back a copy with enum fields coerced
 * to CHECK-valid values. Returns { record, warnings[] } so the caller
 * can toast the user if we silently corrected something.
 */
export function sanitizeDrawingPayload(raw: DrawingPayload = {}): {
  record: DrawingPayload;
  warnings: string[];
} {
  const warnings: string[] = [];
  const record: DrawingPayload = { ...raw };

  if ("stage" in raw) {
    const safe = coerceDrawingStage(raw.stage, "Not Started");
    if (safe !== raw.stage) warnings.push(`stage "${String(raw.stage)}" coerced to "${String(safe)}"`);
    record.stage = safe;
  }
  if ("upload_status" in raw) {
    const safe = coerceUploadStatus(raw.upload_status, "Uploaded");
    if (safe !== raw.upload_status) {
      warnings.push(`upload_status "${String(raw.upload_status)}" coerced to "${String(safe)}"`);
    }
    record.upload_status = safe;
  }
  if ("ai_extraction_status" in raw && raw.ai_extraction_status != null) {
    const safe = coerceAiExtractionStatus(raw.ai_extraction_status, null);
    if (safe !== raw.ai_extraction_status) {
      warnings.push(
        `ai_extraction_status "${String(raw.ai_extraction_status)}" coerced to "${String(safe)}"`,
      );
    }
    if (safe == null) delete record.ai_extraction_status;
    else record.ai_extraction_status = safe;
  }

  return { record, warnings };
}

export function sanitizeDrawingSetPayload(raw: DrawingSetPayload = {}): {
  record: DrawingSetPayload;
  warnings: string[];
} {
  const warnings: string[] = [];
  const record: DrawingSetPayload = { ...raw };

  if ("set_approval_status" in raw && raw.set_approval_status != null) {
    const safe = coerceSetApprovalStatus(raw.set_approval_status, null);
    if (safe !== raw.set_approval_status) {
      warnings.push(
        `set_approval_status "${String(raw.set_approval_status)}" coerced to "${String(safe)}"`,
      );
    }
    if (safe == null) delete record.set_approval_status;
    else record.set_approval_status = safe;
  }

  return { record, warnings };
}
