/**
 * bulkAddRows — the deterministic boundary between SubmittalBulkAddModal's
 * parsed CSV and what it hands the parent to insert.
 *
 * This lives outside the component because its correctness is subtle and
 * needs a test. `submittals` has three CHECK-constrained columns this path
 * can write — `status`, `submittal_type` and `ball_in_court` — and a pasted
 * spreadsheet supplies all three as free text. Anything outside a
 * constraint's vocabulary is a 400 from PostgREST, which fails the row with
 * a raw Postgres constraint name for a message.
 *
 * The ordering below is load-bearing, and getting it wrong is exactly how
 * `ball_in_court` was broken before: the spread of the raw row must come
 * FIRST, so the clamped values overwrite it. Written the other way round —
 * `{ ball_in_court: "Contractor", ...row }` — the raw cell wins over the
 * default and goes straight to the database. `reviewer` is a recognised
 * header alias for `ball_in_court`, so that is not a hypothetical: a
 * spreadsheet whose Reviewer column holds a person or a firm 400'd the row.
 */
import { normalizeBallInCourt, type BallInCourtParty } from "@/lib/ballInCourt";

/** Statuses `submittals_status_check` permits. */
export const STATUSES = [
  "Draft", "Submitted", "Under Review", "Approved", "Approved as Noted",
  "Revise and Resubmit", "Rejected", "Released for Fabrication", "Void",
] as const;

/** Types `submittals_submittal_type_check` permits (the column is nullable). */
export const SUBMITTAL_TYPES = [
  "Shop Drawing", "Product Data", "Sample", "Mock-up", "Calculation", "Other",
] as const;

/**
 * One row as `parseCsv` produces it. Every key is optional because the parser
 * only assigns a field when its cell held something — a blank Reviewer cell
 * leaves `ball_in_court` ABSENT rather than empty, which is what lets the
 * enrichment below tell "no column" apart from "unreadable value".
 */
export interface ParsedBulkAddRow {
  submittal_number?: string;
  title?: string;
  discipline?: string;
  submittal_type?: string;
  status?: string;
  ball_in_court?: string;
  required_date?: string;
  submitted_date?: string;
  spec_section?: string;
  submitted_by?: string;
  notes?: string;
}

/** A row that is safe to insert: NOT NULLs filled, constrained columns clamped. */
export interface BulkAddRow extends Omit<ParsedBulkAddRow, "ball_in_court"> {
  submittal_number: string;
  title: string;
  status: string;
  ball_in_court: BallInCourtParty | null;
}

/**
 * Case- and punctuation-insensitive match against a canonical vocabulary.
 * Returns null rather than the input when nothing matches, so a caller can
 * never pass an unrecognised value through by accident.
 */
export function clampToEnum(value: unknown, choices: readonly string[]): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const norm = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const choice of choices) {
    if (choice.toLowerCase().replace(/[^a-z0-9]+/g, "") === norm) return choice;
  }
  return null;
}

/**
 * Apply defaults and DB-safety clamps to every parsed row.
 *
 * `submittal_number` and `title` are both NOT NULL, so each is backfilled
 * from the other — better than failing a row the user clearly meant.
 * `submittal_type` is omitted entirely when it cannot be clamped, because the
 * column is nullable but its CHECK rejects an empty string.
 */
export function buildBulkAddRows(rows: readonly ParsedBulkAddRow[]): BulkAddRow[] {
  return rows.map((row) => {
    const clampedType = clampToEnum(row.submittal_type, SUBMITTAL_TYPES);
    const clampedStatus = clampToEnum(row.status, STATUSES) ?? "Draft";
    const submittalNumber = (row.submittal_number || row.title || "").trim();
    const title = (row.title || row.submittal_number || "").trim();

    const out: BulkAddRow = {
      // Raw row FIRST — see the header. Everything below overwrites it.
      ...row,
      submittal_number: submittalNumber,
      title,
      status: clampedStatus,
      // Absent column -> the documented Contractor default. Present but
      // unplaceable -> null, which the constraint permits and which is the
      // honest reading: the party is unknown, not Contractor.
      ball_in_court: "ball_in_court" in row
        ? normalizeBallInCourt(row.ball_in_court)
        : "Contractor",
    };

    if (clampedType) out.submittal_type = clampedType;
    else delete out.submittal_type;

    return out;
  });
}
