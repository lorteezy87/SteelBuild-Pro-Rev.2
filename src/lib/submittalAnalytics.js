/**
 * submittalAnalytics.js — Pure analytics helpers for the Submittal Hub.
 *
 * No React, no Supabase, no side effects. All functions take plain
 * arrays of submittal / round records (already loaded by the caller's
 * useSubmittals hook) and return numbers, arrays, or grouped maps.
 *
 * Used by:
 *   - DrawingSubmittalHub Approval Matrix tab (cycle time card,
 *     fab-ready KPI tile, aging report table).
 *
 * The whole module is intentionally framework-agnostic so it can be
 * tested with Vitest without spinning up React.
 *
 * Glossary:
 *   - "Cycle time" — calendar days between submitted_date (or the
 *     round's submitted_date if available) and the moment the submittal
 *     reaches a TERMINAL_STATUSES bucket. We approximate the terminal
 *     timestamp using the latest of (returned_date, updated_at) on the
 *     submittal row, falling back to whichever is set.
 *   - "BIC at terminal time" — the ball_in_court value on the submittal
 *     when it reached terminal. We don't have a per-state history
 *     table, so we use the current ball_in_court field. For terminal
 *     submittals that's effectively the reviewer who returned it.
 *   - "Days stuck" — calendar days between now and the most recent
 *     status-change timestamp. We approximate that with the latest of
 *     (returned_date, submitted_date, updated_at, created_at).
 */

// Re-declare TERMINAL_STATUSES locally to avoid pulling in the .ts hook.
// MUST stay in sync with src/hooks/useSubmittals.ts.
export const TERMINAL_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);

export const REJECTED_STATUSES = new Set([
  "Rejected",
  "Void",
]);

// ── time helpers ───────────────────────────────────────────────────

/** ms in one calendar day. */
const DAY_MS = 86_400_000;

/** Parse an ISO string / Date / number into ms-since-epoch, or null. */
export function toEpochMs(input) {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Calendar-day difference between two timestamps. Always positive. */
export function diffDays(start, end) {
  const a = toEpochMs(start);
  const b = toEpochMs(end);
  if (a === null || b === null) return null;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/** Pick the most recent (highest) timestamp from a list of candidates. */
export function latestTimestamp(...candidates) {
  let best = null;
  for (const c of candidates) {
    const t = toEpochMs(c);
    if (t !== null && (best === null || t > best)) best = t;
  }
  return best;
}

// ── cycle time ─────────────────────────────────────────────────────

/**
 * Pick the terminal-time reviewer for a submittal. The submittal's own
 * `ball_in_court` is now CLEARED (→ null) when the cycle closes
 * (Released for Fabrication / Void) — see useSubmittals.addSubmittalRound —
 * so reading it directly would collapse every released submittal to
 * "Unassigned". The durable source is the latest `submittal_rounds` row's
 * ball_in_court (the reviewer who closed the cycle).
 *
 * Order: latest round's ball_in_court → submittal.ball_in_court (legacy /
 * mid-flow rows that still carry a BIC) → "Unassigned".
 *
 * @param {object}   submittal
 * @param {object[]} [rounds] — this submittal's rounds (any order)
 */
function terminalReviewer(submittal, rounds) {
  if (Array.isArray(rounds) && rounds.length > 0) {
    // Latest round by round_number desc; ties keep array order (stable).
    let latest = null;
    let latestNum = -Infinity;
    for (const r of rounds) {
      const n = Number(r?.round_number);
      const num = Number.isFinite(n) ? n : 0;
      if (num >= latestNum) { latest = r; latestNum = num; }
    }
    if (latest?.ball_in_court) return latest.ball_in_court;
  }
  return submittal.ball_in_court || "Unassigned";
}

/**
 * Compute submitted→terminal cycle time for a single submittal.
 * Returns { days, reviewer } or null if the submittal is not terminal
 * or is missing a usable submitted_date.
 *
 * `reviewer` is the BIC at terminal time. Because the submittal's BIC is
 * cleared on close, the reviewer is read from the latest round (passed in)
 * when available, falling back to the submittal's BIC then "Unassigned".
 *
 * @param {object}   submittal
 * @param {object[]} [rounds] — this submittal's rounds (for reviewer attribution)
 */
export function computeOneCycleTime(submittal, rounds) {
  if (!submittal) return null;
  if (!TERMINAL_STATUSES.has(submittal.status)) return null;
  const start = toEpochMs(submittal.submitted_date);
  if (start === null) return null;
  // Terminal time = latest of returned_date / updated_at.
  const end = latestTimestamp(submittal.returned_date, submittal.updated_at);
  if (end === null || end < start) return null;
  const days = Math.round((end - start) / DAY_MS);
  const reviewer = terminalReviewer(submittal, rounds);
  return { days: Math.max(0, days), reviewer };
}

/**
 * Compute cycle-time stats grouped by reviewer (BIC at terminal time).
 *
 * Returns:
 *   {
 *     overall: { count, avg, p50, p90, samples: number[] },
 *     byReviewer: Array<{ reviewer, count, avg, p50, p90 }>
 *   }
 *
 * Submittals that are still open or missing a submitted_date are
 * silently dropped (they have no cycle time yet).
 *
 * Pass `roundsBySubmittal` (a `{ [submittal_id]: round[] }` map) so the
 * per-reviewer grouping reads the closing reviewer from the latest round —
 * the submittal's own ball_in_court is cleared on close. Omit it and the
 * grouping falls back to the submittal BIC / "Unassigned" (legacy behaviour).
 */
export function computeCycleTime(submittals, { now = Date.now(), roundsBySubmittal = null } = {}) {
  if (!Array.isArray(submittals)) submittals = [];
  const samples = [];
  const grouped = new Map();
  for (const s of submittals) {
    if (s?.is_deleted) continue;
    const rounds = roundsBySubmittal && s?.id ? roundsBySubmittal[s.id] : undefined;
    const out = computeOneCycleTime(s, rounds);
    if (!out) continue;
    samples.push(out.days);
    if (!grouped.has(out.reviewer)) grouped.set(out.reviewer, []);
    grouped.get(out.reviewer).push(out.days);
  }
  const overall = {
    count: samples.length,
    avg:  computeAverage(samples),
    p50:  computeP50(samples),
    p90:  computeP90(samples),
    samples,
  };
  const byReviewer = Array.from(grouped.entries())
    .map(([reviewer, arr]) => ({
      reviewer,
      count: arr.length,
      avg:   computeAverage(arr),
      p50:   computeP50(arr),
      p90:   computeP90(arr),
    }))
    .sort((a, b) => b.count - a.count);
  // `now` is accepted to keep the API future-proof (e.g. for a "last 30
  // days" filter applied inside this function rather than the caller).
  // Currently unused but kept so callers don't need to change.
  void now;
  return { overall, byReviewer };
}

/**
 * Filter submittals to those whose submitted_date is within the last
 * `days` calendar days. `null` / 0 / negative → no filter (return all).
 */
export function filterByDaysWindow(submittals, days, { now = Date.now() } = {}) {
  if (!Array.isArray(submittals)) return [];
  if (!days || days <= 0) return submittals.slice();
  const cutoff = now - days * DAY_MS;
  return submittals.filter((s) => {
    const t = toEpochMs(s?.submitted_date);
    return t !== null && t >= cutoff;
  });
}

// ── percentile + average ───────────────────────────────────────────

/** Compute average of a numeric array. Returns 0 for empty input. */
export function computeAverage(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * Linear-interpolation percentile (matches the "type 7" definition
 * used by numpy/Excel). `p` is in [0, 1]. Returns 0 for empty input.
 */
export function computePercentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return Math.round(sorted[lo] * 10) / 10;
  const frac = rank - lo;
  const v = sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
  return Math.round(v * 10) / 10;
}

export const computeP50 = (values) => computePercentile(values, 0.5);
export const computeP90 = (values) => computePercentile(values, 0.9);

/** Convenience: returns { p50, p90 } in one call. */
export function computeP50P90(values) {
  return {
    p50: computeP50(values),
    p90: computeP90(values),
  };
}

// ── aging report ───────────────────────────────────────────────────

/**
 * Last-activity timestamp for an open submittal. We don't have a
 * dedicated history table, so this is the latest of:
 *   - returned_date (last reviewer action)
 *   - submitted_date (when this round was sent)
 *   - updated_at (last patch)
 *   - created_at (initial creation)
 */
export function computeLastActivityMs(submittal) {
  if (!submittal) return null;
  return latestTimestamp(
    submittal.returned_date,
    submittal.submitted_date,
    submittal.updated_at,
    submittal.created_at,
  );
}

/**
 * Compute the "aging" list — open (non-terminal) submittals whose
 * last-activity timestamp is older than `thresholdDays`.
 *
 * Returns rows shaped for direct rendering in the aging table:
 *   {
 *     id, number, title, status, bic, daysStuck,
 *     lastActivityMs, lastActivityIso,
 *   }
 *
 * Sorted by daysStuck descending.
 */
export function computeAgingReport(submittals, {
  thresholdDays = 7,
  now = Date.now(),
} = {}) {
  if (!Array.isArray(submittals)) return [];
  const rows = [];
  for (const s of submittals) {
    if (!s || s.is_deleted) continue;
    if (TERMINAL_STATUSES.has(s.status)) continue;
    const lastActivityMs = computeLastActivityMs(s);
    if (lastActivityMs === null) continue;
    const daysStuck = Math.max(0, Math.round((now - lastActivityMs) / DAY_MS));
    if (daysStuck < thresholdDays) continue;
    rows.push({
      id: s.id,
      number: s.submittal_number || "—",
      title:  s.title || s.description || "—",
      status: s.status || "Draft",
      bic:    s.ball_in_court || "Unassigned",
      daysStuck,
      lastActivityMs,
      lastActivityIso: new Date(lastActivityMs).toISOString(),
    });
  }
  rows.sort((a, b) => b.daysStuck - a.daysStuck);
  return rows;
}

// ── fab-ready % KPI ────────────────────────────────────────────────

/**
 * Compute the "fabrication-ready" KPI:
 *   numerator   = drawings whose latest associated submittal status is
 *                 "Released for Fabrication"
 *   denominator = active drawings (exclude voided / rejected, exclude
 *                 superseded / soft-deleted)
 *
 * Returns { numerator, denominator, percent } where percent is
 * rounded to one decimal. Denominator-zero returns
 * { numerator: 0, denominator: 0, percent: 0 }.
 *
 * The link between submittal and drawing is via either:
 *   - submittal.drawing_id (single)              — primary
 *   - submittal.drawing_ids (array)              — multi-link
 *   - submittal.drawing_set_ids (array of sets)  — fallback (any
 *     drawing whose drawing_set_id matches gets credit)
 *
 * Voided submittals never count toward fab-ready.
 * "Latest" is by round_number desc, then submitted_date desc.
 */
export function computeFabReady(drawings, submittals) {
  drawings   = Array.isArray(drawings)   ? drawings   : [];
  submittals = Array.isArray(submittals) ? submittals : [];

  // Pre-filter active drawings for the denominator.
  const activeDrawings = drawings.filter((d) => {
    if (!d) return false;
    if (d.is_deleted || d.is_superseded) return false;
    // Exclude voided / rejected drawings — they're not "active".
    if (d.stage === "Void" || d.stage === "Rejected") return false;
    return true;
  });

  if (activeDrawings.length === 0) {
    return { numerator: 0, denominator: 0, percent: 0 };
  }

  // Index latest submittal per drawing id and per set id.
  // Skip voided submittals entirely.
  const latestByDrawing = new Map();
  const latestBySet     = new Map();

  const isNewer = (candidate, current) => {
    if (!current) return true;
    const cr = candidate.round_number || 1;
    const tr = current.round_number   || 1;
    if (cr !== tr) return cr > tr;
    const cd = toEpochMs(candidate.submitted_date) ?? 0;
    const td = toEpochMs(current.submitted_date)   ?? 0;
    return cd >= td;
  };

  for (const sub of submittals) {
    if (!sub || sub.is_deleted) continue;
    if (sub.status === "Void") continue;
    const ids = collectDrawingIds(sub);
    for (const did of ids) {
      const cur = latestByDrawing.get(did);
      if (isNewer(sub, cur)) latestByDrawing.set(did, sub);
    }
    const setIds = Array.isArray(sub.drawing_set_ids) ? sub.drawing_set_ids : [];
    for (const sid of setIds) {
      const cur = latestBySet.get(sid);
      if (isNewer(sub, cur)) latestBySet.set(sid, sub);
    }
  }

  let numerator = 0;
  for (const d of activeDrawings) {
    const sub = latestByDrawing.get(d.id) || latestBySet.get(d.drawing_set_id);
    if (sub && sub.status === "Released for Fabrication") numerator++;
  }

  const denominator = activeDrawings.length;
  const percent = denominator === 0 ? 0
    : Math.round((numerator / denominator) * 1000) / 10;
  return { numerator, denominator, percent };
}

/** Collect candidate drawing ids referenced by a submittal. */
function collectDrawingIds(sub) {
  const out = new Set();
  if (sub.drawing_id) out.add(sub.drawing_id);
  if (Array.isArray(sub.drawing_ids)) {
    for (const id of sub.drawing_ids) if (id) out.add(id);
  }
  return out;
}
