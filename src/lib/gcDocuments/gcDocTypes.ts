/**
 * gcDocTypes.ts — Single source of truth for the GC document register's enum
 * values. These MUST match the CHECK constraints on gc_drawing_sets in Supabase
 * (project kjrwqagyeswwoxpjkcko, migration 20260919120000_gc_document_register).
 * Drift between the UI and the DB silently fails the INSERT and the user loses
 * what they typed — the same failure mode drawingEnums.ts exists to prevent.
 *
 * Scope note: this is the register of what the GC sends US. It is a separate
 * namespace from `drawings` / `drawing_sets`, which are OUR shop drawings. A
 * sheet number appearing in both is NOT the same sheet, and nothing in here
 * can release steel — fabrication release stays with src/lib/fabReleaseGate.ts.
 */

// ── Document type ───────────────────────────────────────────────────────────
// Mirrors gc_drawing_sets_doc_type_check. The vocabulary is the one the repo
// already carried as prose in the COMMENT on drawing_revisions.revision_source.

export const GC_DOC_TYPES = [
  "gc_drawing",
  "asi",
  "addendum",
  "bulletin",
  "ccd",
  "revision",
  "contract_document",
  "specification",
] as const;

export type GcDocType = (typeof GC_DOC_TYPES)[number];

export const GC_DOC_TYPE_LABELS: Record<GcDocType, string> = {
  gc_drawing: "GC Drawing",
  asi: "ASI",
  addendum: "Addendum",
  bulletin: "Bulletin",
  ccd: "CCD",
  revision: "Revision",
  contract_document: "Contract Document",
  specification: "Specification",
};

/** Longer help text for the type picker — these get confused in the field. */
export const GC_DOC_TYPE_HINTS: Record<GcDocType, string> = {
  gc_drawing: "A GC- or design-team-issued drawing set (CD set, permit set, IFC set).",
  asi: "Architect's Supplemental Instruction — clarification issued after award.",
  addendum: "Pre-award change to the bid documents.",
  bulletin: "Owner/architect issuance bundling changes for pricing.",
  ccd: "Construction Change Directive — proceed now, price later.",
  revision: "A reissue of drawings already in the register.",
  contract_document: "Contract, exhibit, scope letter, or other non-sheet document.",
  specification: "Spec section or spec book.",
};

/**
 * Types that normally arrive AFTER the contract is signed and therefore carry
 * cost/schedule exposure. Used to sort the pending-review queue, never to
 * decide impact — only a person decides that (see STEEL_IMPACT_STATES).
 */
export const POST_AWARD_GC_DOC_TYPES: ReadonlySet<GcDocType> = new Set<GcDocType>([
  "asi",
  "bulletin",
  "ccd",
  "revision",
]);

export const DEFAULT_GC_DOC_TYPE: GcDocType = "gc_drawing";

export function isGcDocType(value: unknown): value is GcDocType {
  return typeof value === "string" && (GC_DOC_TYPES as readonly string[]).includes(value);
}

/** Silent fallback for a read — an unrecognised value renders as a GC drawing. */
export function coerceGcDocType(value: unknown): GcDocType {
  return isGcDocType(value) ? value : DEFAULT_GC_DOC_TYPE;
}

export function gcDocTypeLabel(value: unknown): string {
  return GC_DOC_TYPE_LABELS[coerceGcDocType(value)];
}

// ── Steel impact ────────────────────────────────────────────────────────────
// Mirrors gc_drawing_sets_steel_impact_check.

/**
 * Whether an issuance affects steel scope.
 *
 * "unknown" is the default and is NOT the same as "none". An ASI nobody has
 * opened yet has not been cleared — it has not been looked at. Rendering that
 * as "no impact" tells a PM the opposite of the truth, which is the exact
 * failure CLAUDE.md's "Absence is not evidence" rule describes. Only
 * `steelImpactIsDecided` may gate a claim that the question is settled.
 */
export const STEEL_IMPACT_STATES = [
  "unknown",
  "pending_review",
  "none",
  "impacted",
] as const;

export type SteelImpact = (typeof STEEL_IMPACT_STATES)[number];

export const STEEL_IMPACT_LABELS: Record<SteelImpact, string> = {
  unknown: "Not reviewed",
  pending_review: "Pending review",
  none: "No steel impact",
  impacted: "Impacts steel",
};

/** Short form for a table chip, where the column header supplies the context. */
export const STEEL_IMPACT_SHORT_LABELS: Record<SteelImpact, string> = {
  unknown: "—",
  pending_review: "Reviewing",
  none: "None",
  impacted: "Impacted",
};

/**
 * Design-system status tokens. Never hardcode hex for these — CLAUDE.md
 * ("Design system") requires CSS variables for anything surface/text/border.
 */
export const STEEL_IMPACT_TOKENS: Record<SteelImpact, string> = {
  unknown: "var(--text-muted)",
  pending_review: "var(--status-review)",
  none: "var(--status-success)",
  impacted: "var(--status-error)",
};

export const DEFAULT_STEEL_IMPACT: SteelImpact = "unknown";

export function isSteelImpact(value: unknown): value is SteelImpact {
  return typeof value === "string" && (STEEL_IMPACT_STATES as readonly string[]).includes(value);
}

export function coerceSteelImpact(value: unknown): SteelImpact {
  return isSteelImpact(value) ? value : DEFAULT_STEEL_IMPACT;
}

export function steelImpactLabel(value: unknown): string {
  return STEEL_IMPACT_LABELS[coerceSteelImpact(value)];
}

/**
 * True only when a person has actually answered the question. Guard every
 * printed claim about steel impact with this; "unknown" and "pending_review"
 * are both open questions, not answers.
 */
export function steelImpactIsDecided(value: unknown): boolean {
  const state = coerceSteelImpact(value);
  return state === "none" || state === "impacted";
}

/** Needs someone to look at it: never reviewed, or review started and unfinished. */
export function steelImpactNeedsReview(value: unknown): boolean {
  return !steelImpactIsDecided(value);
}

// ── Discipline category (pre-existing column, unchanged by this feature) ────
// Mirrors gc_drawing_sets_category_check. Note this is a DISCIPLINE, not a
// document type — an ASI and a 100% CD set can share `category`, which is why
// doc_type had to exist separately.

export const GC_SET_CATEGORIES = [
  "architectural",
  "structural",
  "civil",
  "mechanical",
  "electrical",
  "plumbing",
  "specifications",
  "other",
] as const;

export type GcSetCategory = (typeof GC_SET_CATEGORIES)[number];

export const GC_SET_CATEGORY_LABELS: Record<GcSetCategory, string> = {
  architectural: "Architectural",
  structural: "Structural",
  civil: "Civil",
  mechanical: "Mechanical",
  electrical: "Electrical",
  plumbing: "Plumbing",
  specifications: "Specifications",
  other: "Other",
};

export const DEFAULT_GC_SET_CATEGORY: GcSetCategory = "architectural";

export function isGcSetCategory(value: unknown): value is GcSetCategory {
  return typeof value === "string" && (GC_SET_CATEGORIES as readonly string[]).includes(value);
}

export function coerceGcSetCategory(value: unknown): GcSetCategory {
  return isGcSetCategory(value) ? value : DEFAULT_GC_SET_CATEGORY;
}

export function gcSetCategoryLabel(value: unknown): string {
  return GC_SET_CATEGORY_LABELS[coerceGcSetCategory(value)];
}

// ── Write-path sanitiser ────────────────────────────────────────────────────

export interface SanitizedGcSetPayload {
  record: Record<string, unknown>;
  warnings: string[];
}

/**
 * Coerce the three constrained columns to values the DB will accept, reporting
 * anything corrected. Same contract and same reason as
 * `sanitizeDrawingPayload` in drawingEnums.ts: Postgres rejects a bad CHECK
 * value outright, and the user loses the save with a raw constraint name.
 *
 * Only keys actually present are touched, so this is safe on a partial UPDATE.
 */
export function sanitizeGcDrawingSetPayload(
  input: Record<string, unknown>,
): SanitizedGcSetPayload {
  const record = { ...input };
  const warnings: string[] = [];

  if ("doc_type" in record) {
    const next = coerceGcDocType(record.doc_type);
    if (next !== record.doc_type) {
      warnings.push(`doc_type ${JSON.stringify(record.doc_type)} -> ${next}`);
    }
    record.doc_type = next;
  }

  if ("steel_impact" in record) {
    const next = coerceSteelImpact(record.steel_impact);
    if (next !== record.steel_impact) {
      warnings.push(`steel_impact ${JSON.stringify(record.steel_impact)} -> ${next}`);
    }
    record.steel_impact = next;
  }

  if ("category" in record) {
    const next = coerceGcSetCategory(record.category);
    if (next !== record.category) {
      warnings.push(`category ${JSON.stringify(record.category)} -> ${next}`);
    }
    record.category = next;
  }

  return { record, warnings };
}
