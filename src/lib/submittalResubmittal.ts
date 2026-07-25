/**
 * submittalResubmittal.ts — Pure helpers for the "stronger resubmittal"
 * workflow (§20).
 *
 * When a reviewer returns a submittal Revise-and-Resubmit, the detailer
 * owes a fresh round that ADDRESSES every open reviewer comment. The
 * structured reviewer feedback already lives, round-scoped, in
 * `submittal_sheet_responses` (per-sheet `response_status` +
 * `reviewer_comment`). These helpers pick the responses that still require
 * detailer action and carry them forward into the next round so nothing is
 * dropped between rounds — no new schema needed.
 *
 * "Unresolved" = a reviewer disposition that requires another round:
 *   Revise and Resubmit, Rejected, See Comments
 * "No Exception" and "Approved as Noted" are clear-to-fabricate and need no
 * resubmission, so they are never carried forward.
 *
 * Pure: no React, no Supabase, no side effects, no `new Date()`.
 */

export const UNRESOLVED_RESPONSE_STATUSES = new Set<string>([
  "Revise and Resubmit",
  "Rejected",
  "See Comments",
]);

export interface SheetResponse {
  submittal_round_id?: string | null;
  drawing_id?: string | null;
  drawing_set_id?: string | null;
  sheet_number?: string | null;
  response_status?: string | null;
  reviewer_comment?: string | null;
}

export interface RoundLike {
  id?: string | null;
  round_number?: number | null;
}

export interface OpenItem {
  drawing_id: string | null;
  sheet_number: string;
  response_status: string;
  reviewer_comment: string;
}

/**
 * The subset of a returned round's sheet responses that still require
 * detailer action, normalized for display + carry-forward. Order is
 * preserved (reviewers tend to comment top-down through the set).
 */
export function collectOpenItems(
  responses: SheetResponse[] | null | undefined,
): OpenItem[] {
  if (!Array.isArray(responses)) return [];
  return responses
    .filter(
      (r) => r && UNRESOLVED_RESPONSE_STATUSES.has(String(r.response_status)),
    )
    .map((r) => ({
      drawing_id: r.drawing_id ?? null,
      sheet_number: (r.sheet_number || "").trim() || "—",
      response_status: String(r.response_status),
      reviewer_comment: (r.reviewer_comment || "").trim(),
    }));
}

/**
 * Choose which round's responses to carry forward into the next round.
 *
 * The round model logs a row per status event, so the latest round is often
 * the bare status-change event (no per-sheet responses). The reviewer's
 * actual dispositions live on the most recent round that was actually
 * reviewed — so we walk the rounds newest-first and return the first one
 * that carries any sheet responses.
 *
 * @param roundsAsc  rounds for one submittal, ascending by round_number
 * @param responses  all sheet responses for that submittal
 */
export function pickCarryForwardResponses(
  roundsAsc: RoundLike[] | null | undefined,
  responses: SheetResponse[] | null | undefined,
): { round: RoundLike | null; responses: SheetResponse[] } {
  const rounds = Array.isArray(roundsAsc) ? roundsAsc : [];
  const all = Array.isArray(responses) ? responses : [];
  for (let i = rounds.length - 1; i >= 0; i--) {
    const round = rounds[i];
    if (!round?.id) continue;
    const forRound = all.filter((r) => r && r.submittal_round_id === round.id);
    if (forRound.length > 0) return { round, responses: forRound };
  }
  return { round: null, responses: [] };
}

/**
 * Seed text for the new round's response_notes: a checklist of the open
 * items carried from the prior round so the detailer's resubmittal cover
 * note starts with exactly what must be addressed. Returns "" when there
 * is nothing to carry (graceful no-op — the modal behaves as before).
 */
export function formatCarryForwardNotes(
  prevRoundNumber: number | null | undefined,
  openItems: OpenItem[] | null | undefined,
): string {
  const items = Array.isArray(openItems) ? openItems : [];
  if (items.length === 0) return "";
  const rn = Number(prevRoundNumber) || null;
  const count = items.length;
  const noun = count === 1 ? "comment" : "comments";
  const header = rn
    ? `Resubmittal addressing ${count} reviewer ${noun} from Round ${rn}:`
    : `Resubmittal addressing ${count} reviewer ${noun}:`;
  const lines = items.map((it) => {
    const comment = it.reviewer_comment ? ` — ${it.reviewer_comment}` : "";
    return `• Sheet ${it.sheet_number} (${it.response_status})${comment}`;
  });
  return [header, ...lines].join("\n");
}

/**
 * Merge sheet-response carry-forward notes with structured comment-disposition
 * notes (Slice 5). Empty parts are omitted; both present → blank-line join.
 */
export function mergeCarryForwardNotes(
  sheetNotes: string | null | undefined,
  dispositionNotes: string | null | undefined,
): string {
  const parts = [String(sheetNotes ?? "").trim(), String(dispositionNotes ?? "").trim()].filter(
    Boolean,
  );
  return parts.join("\n\n");
}

// ── Response matrix (round-over-round per-sheet disposition) ──────────

export interface DrawingLike {
  id: string;
  sheet_number?: string | null;
  drawing_number?: string | null;
  title?: string | null;
  drawing_title?: string | null;
}

export interface MatrixColumn {
  id: string;
  round_number: number;
}

export interface MatrixCell {
  response_status: string;
  reviewer_comment: string;
}

export interface MatrixRow {
  key: string;
  drawing_id: string | null;
  sheet_number: string;
  title: string;
  /** Cell per round id (sparse — a sheet may not appear in every round). */
  cells: Record<string, MatrixCell>;
}

export interface ResponseMatrix {
  columns: MatrixColumn[];
  rows: MatrixRow[];
}

/**
 * Pivot a submittal's per-sheet reviewer responses into a sheet × round
 * matrix so the team can read each sheet's disposition across rounds at a
 * glance (Round 1 said R&R → Round 2 said No Exception, etc.).
 *
 * Columns are the rounds that actually carry responses (bare status-event
 * rounds are skipped), ascending by round number. Rows are unique sheets
 * (keyed by drawing when present, else sheet number), sorted naturally by
 * sheet number. Drawing metadata fills in a blank sheet number / title.
 */
export function buildResponseMatrix(args: {
  rounds?: RoundLike[] | null;
  responses?: SheetResponse[] | null;
  drawings?: DrawingLike[] | null;
}): ResponseMatrix {
  const rounds = Array.isArray(args?.rounds) ? args.rounds : [];
  const responses = Array.isArray(args?.responses) ? args.responses : [];
  const drawings = Array.isArray(args?.drawings) ? args.drawings : [];

  const drawingById = new Map<string, DrawingLike>();
  for (const d of drawings) if (d?.id) drawingById.set(d.id, d);

  const roundsWithResponses = new Set(
    responses.map((r) => r?.submittal_round_id).filter(Boolean) as string[],
  );
  const columns: MatrixColumn[] = rounds
    .filter((r) => r?.id && roundsWithResponses.has(r.id))
    .map((r) => ({ id: r.id as string, round_number: Number(r.round_number) || 0 }))
    .sort((a, b) => a.round_number - b.round_number);
  const columnIds = new Set(columns.map((c) => c.id));

  const rowMap = new Map<string, MatrixRow>();
  for (const resp of responses) {
    const roundId = resp?.submittal_round_id;
    if (!resp || !roundId || !columnIds.has(roundId)) continue;
    const d = resp.drawing_id ? drawingById.get(resp.drawing_id) : null;
    const sheet =
      (resp.sheet_number || d?.sheet_number || d?.drawing_number || "").trim() || "—";
    const title = (d?.title || d?.drawing_title || "").trim();
    const key = resp.drawing_id || `sheet:${sheet}`;
    let row = rowMap.get(key);
    if (!row) {
      row = { key, drawing_id: resp.drawing_id ?? null, sheet_number: sheet, title, cells: {} };
      rowMap.set(key, row);
    }
    if (row.sheet_number === "—" && sheet !== "—") row.sheet_number = sheet;
    if (!row.title && title) row.title = title;
    row.cells[roundId] = {
      response_status: String(resp.response_status || ""),
      reviewer_comment: (resp.reviewer_comment || "").trim(),
    };
  }

  const rows = Array.from(rowMap.values()).sort((a, b) =>
    a.sheet_number.localeCompare(b.sheet_number, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return { columns, rows };
}
