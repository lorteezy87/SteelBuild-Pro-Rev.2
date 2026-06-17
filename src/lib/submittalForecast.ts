/**
 * submittalForecast.ts — Deterministic review-cycle forecasting (§20).
 *
 * Answers the PM's question for a submittal that's out for review: "when will
 * this come back, and is it going to be late?" It learns the shop's actual
 * review turnaround from history and projects an expected + worst-case return
 * for each pending submittal, then flags the ones that threaten their required
 * date (and, by extension, fabrication).
 *
 * Sample sources (combined, de-duplicated):
 *   1. submittal_rounds with submitted_date → returned_date (per-round truth,
 *      preferred). The round log is new, so this can be empty.
 *   2. submittals with submitted_date → returned_date (or approved_date), but
 *      ONLY for submittals that have no completed round, so a submittal's cycle
 *      is never counted twice.
 *
 * Stats are bucketed by reviewer and by discipline; a bucket is only trusted
 * once it has MIN_BUCKET_SAMPLES, otherwise the overall distribution is used,
 * and a hard default when there is no history at all.
 *
 * Pure: no React, no Supabase, no side effects. `today` is always injected as
 * a 'YYYY-MM-DD' string (never `new Date()` inside) — keeps it testable and
 * dodges the UTC/Arizona date gotcha.
 */

export const DEFAULT_CYCLE_DAYS = 14;
export const MIN_BUCKET_SAMPLES = 3;

const ACTIVE_REVIEW_STATUSES = new Set(["Submitted", "Under Review"]);

export interface RoundRow {
  submittal_id?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  reviewer?: string | null;
}

export interface SubmittalRow {
  id?: string | null;
  status?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  approved_date?: string | null;
  required_date?: string | null;
  reviewer?: string | null;
  discipline?: string | null;
  drawing_set_ids?: string[] | null;
}

export interface CycleBucket {
  count: number;
  p50: number;
  p75: number;
  mean: number;
}

export interface CycleStats {
  overall: CycleBucket;
  byReviewer: Map<string, CycleBucket>;
  byDiscipline: Map<string, CycleBucket>;
  sampleCount: number;
}

// ── Date helpers (local-noon parse — DST/UTC-safe) ───────────────────

function parseLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/** Whole calendar days from a → b (b − a). null if either is unparseable. */
export function diffDays(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const da = parseLocalDate(a);
  const db = parseLocalDate(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** Add n days to a 'YYYY-MM-DD' date, returning the same format. */
export function addDays(iso: string | null | undefined, n: number): string | null {
  const d = parseLocalDate(iso);
  if (!d) return null;
  d.setDate(d.getDate() + Math.round(n));
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

// ── Stats ────────────────────────────────────────────────────────────

/** Linear-interpolated percentile (p in [0,1]) of an ascending number list. */
export function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

function norm(v: string | null | undefined): string | null {
  const s = (v || "").trim();
  return s || null;
}

function bucketOf(days: number[]): CycleBucket {
  const sorted = [...days].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, d) => acc + d, 0);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    mean: sorted.length ? sum / sorted.length : 0,
  };
}

interface Sample {
  days: number;
  reviewer: string | null;
  discipline: string | null;
}

/**
 * Build review-cycle statistics from completed rounds + completed submittals.
 * Submittal-level samples are skipped for any submittal that already has a
 * completed round, so a cycle is never double-counted.
 */
export function computeCycleStats(args: {
  rounds?: RoundRow[] | null;
  submittals?: SubmittalRow[] | null;
}): CycleStats {
  const rounds = Array.isArray(args?.rounds) ? args.rounds : [];
  const submittals = Array.isArray(args?.submittals) ? args.submittals : [];

  const samples: Sample[] = [];
  const submittalsWithCompletedRound = new Set<string>();

  for (const r of rounds) {
    const days = diffDays(r?.submitted_date, r?.returned_date);
    if (days == null || days < 0) continue;
    samples.push({ days, reviewer: norm(r?.reviewer), discipline: null });
    if (r?.submittal_id) submittalsWithCompletedRound.add(r.submittal_id);
  }

  for (const s of submittals) {
    if (s?.id && submittalsWithCompletedRound.has(s.id)) continue;
    const end = s?.returned_date || s?.approved_date;
    const days = diffDays(s?.submitted_date, end);
    if (days == null || days < 0) continue;
    samples.push({ days, reviewer: norm(s?.reviewer), discipline: norm(s?.discipline) });
  }

  const allDays = samples.map((s) => s.days);
  const byReviewerDays = new Map<string, number[]>();
  const byDisciplineDays = new Map<string, number[]>();
  for (const s of samples) {
    if (s.reviewer) {
      const arr = byReviewerDays.get(s.reviewer) || [];
      arr.push(s.days);
      byReviewerDays.set(s.reviewer, arr);
    }
    if (s.discipline) {
      const arr = byDisciplineDays.get(s.discipline) || [];
      arr.push(s.days);
      byDisciplineDays.set(s.discipline, arr);
    }
  }

  const byReviewer = new Map<string, CycleBucket>();
  for (const [k, days] of byReviewerDays) byReviewer.set(k, bucketOf(days));
  const byDiscipline = new Map<string, CycleBucket>();
  for (const [k, days] of byDisciplineDays) byDiscipline.set(k, bucketOf(days));

  return {
    overall: bucketOf(allDays),
    byReviewer,
    byDiscipline,
    sampleCount: samples.length,
  };
}

// ── Per-submittal forecast ───────────────────────────────────────────

export type ForecastRisk = "low" | "medium" | "high";

export interface SubmittalForecast {
  forecastable: boolean;
  reason?: string;
  sentDate?: string | null;
  expectedReturn?: string | null;
  worstCaseReturn?: string | null;
  daysOut?: number | null;
  cycleP50?: number;
  cycleP75?: number;
  /** Human label for what the estimate is based on. */
  basis?: string;
  basisCount?: number;
  required?: string | null;
  risk?: ForecastRisk;
  label?: string;
  /** True when a late return would also threaten linked fabrication packages. */
  fabImpact?: boolean;
}

function pickBucket(
  stats: CycleStats,
  reviewer: string | null,
  discipline: string | null,
): { bucket: CycleBucket; label: string } | null {
  const rb = reviewer ? stats.byReviewer.get(reviewer) : null;
  if (rb && rb.count >= MIN_BUCKET_SAMPLES) return { bucket: rb, label: `reviewer ${reviewer}` };
  const db = discipline ? stats.byDiscipline.get(discipline) : null;
  if (db && db.count >= MIN_BUCKET_SAMPLES) return { bucket: db, label: `${discipline} discipline` };
  if (stats.overall.count >= 1) {
    const n = stats.overall.count;
    return { bucket: stats.overall, label: `${n} past review${n === 1 ? "" : "s"}` };
  }
  return null;
}

/**
 * Forecast the return of one pending submittal. Returns `{ forecastable:false }`
 * for submittals that aren't actively under review or have no sent date.
 */
export function forecastSubmittal(args: {
  submittal: SubmittalRow;
  rounds?: RoundRow[] | null;
  stats: CycleStats;
  today: string;
  defaultCycleDays?: number;
}): SubmittalForecast {
  const { submittal, stats, today } = args;
  const rounds = Array.isArray(args.rounds) ? args.rounds : [];
  const defaultCycle = args.defaultCycleDays ?? DEFAULT_CYCLE_DAYS;

  if (!submittal || !ACTIVE_REVIEW_STATUSES.has(String(submittal.status))) {
    return { forecastable: false, reason: "not under review" };
  }

  // Sent date = the latest round's submitted_date for this submittal, else the
  // submittal's own submitted_date.
  const myRounds = rounds
    .filter((r) => r?.submittal_id === submittal.id && r?.submitted_date)
    .sort((a, b) => (diffDays(a.submitted_date, b.submitted_date) || 0));
  const sentDate =
    (myRounds.length ? myRounds[myRounds.length - 1].submitted_date : null) ||
    submittal.submitted_date ||
    null;
  if (!sentDate) return { forecastable: false, reason: "no sent date" };

  const reviewer = norm(submittal.reviewer);
  const discipline = norm(submittal.discipline);
  const picked = pickBucket(stats, reviewer, discipline);

  const p50 = picked ? Math.max(1, Math.round(picked.bucket.p50)) : defaultCycle;
  const p75 = picked
    ? Math.max(p50, Math.round(picked.bucket.p75))
    : Math.round(defaultCycle * 1.5);
  const basis = picked ? picked.label : "default estimate (no history)";

  const expectedReturn = addDays(sentDate, p50);
  const worstCaseReturn = addDays(sentDate, p75);
  const daysOut = diffDays(sentDate, today);
  const required = submittal.required_date || null;

  // Risk: already past the expected return (still out) is the strongest signal;
  // otherwise compare the forecast window to the required date.
  let risk: ForecastRisk = "low";
  let label = "On track";
  const expectedPast = expectedReturn != null && (diffDays(expectedReturn, today) || 0) > 0;
  const expectedAfterRequired =
    required != null && expectedReturn != null && (diffDays(required, expectedReturn) || 0) > 0;
  const worstAfterRequired =
    required != null && worstCaseReturn != null && (diffDays(required, worstCaseReturn) || 0) > 0;

  if (expectedPast) {
    risk = "high";
    label = "Review overdue";
  } else if (expectedAfterRequired) {
    risk = "high";
    label = "Forecast late";
  } else if (worstAfterRequired) {
    risk = "medium";
    label = "At risk";
  }

  const linkedSets = Array.isArray(submittal.drawing_set_ids)
    ? submittal.drawing_set_ids.filter(Boolean)
    : [];
  const fabImpact = risk !== "low" && linkedSets.length > 0;

  return {
    forecastable: true,
    sentDate,
    expectedReturn,
    worstCaseReturn,
    daysOut,
    cycleP50: p50,
    cycleP75: p75,
    basis,
    basisCount: picked ? picked.bucket.count : 0,
    required,
    risk,
    label,
    fabImpact,
  };
}

export interface PortfolioForecast {
  stats: CycleStats;
  forecasts: Array<{ submittal: SubmittalRow; forecast: SubmittalForecast }>;
  summary: { pending: number; onTrack: number; atRisk: number; late: number; fabImpact: number };
}

/**
 * Forecast every actively-reviewed submittal in one pass. Computes the cycle
 * stats once, then forecasts each pending submittal — handy for a "reviews at
 * risk" KPI without recomputing stats per row.
 */
export function forecastPortfolio(args: {
  submittals?: SubmittalRow[] | null;
  rounds?: RoundRow[] | null;
  today: string;
  defaultCycleDays?: number;
}): PortfolioForecast {
  const submittals = Array.isArray(args?.submittals) ? args.submittals : [];
  const rounds = Array.isArray(args?.rounds) ? args.rounds : [];
  const stats = computeCycleStats({ rounds, submittals });

  const forecasts: Array<{ submittal: SubmittalRow; forecast: SubmittalForecast }> = [];
  const summary = { pending: 0, onTrack: 0, atRisk: 0, late: 0, fabImpact: 0 };

  for (const submittal of submittals) {
    const forecast = forecastSubmittal({
      submittal,
      rounds,
      stats,
      today: args.today,
      defaultCycleDays: args.defaultCycleDays,
    });
    if (!forecast.forecastable) continue;
    forecasts.push({ submittal, forecast });
    summary.pending += 1;
    if (forecast.risk === "high") summary.late += 1;
    else if (forecast.risk === "medium") summary.atRisk += 1;
    else summary.onTrack += 1;
    if (forecast.fabImpact) summary.fabImpact += 1;
  }

  return { stats, forecasts, summary };
}
