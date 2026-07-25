/**
 * drawingHealthScore.ts — deterministic per-drawing-SET health score.
 *
 * A 0–100 score (+ letter grade + color band) summarizing how healthy a drawing
 * set is across seven factors. Pure + side-effect-free (mirrors marginRiskEngine):
 * the Hub's Drawing Register + Control Board feed it set packages and render the
 * result. No AI, no I/O — `today` is injected for determinism / tests.
 *
 * Factor weights (max points each can cost; sum = 100):
 *   open RFIs 20 · revision risk 18 · approval status 16 · aging 14 ·
 *   submittal progress 12 · readiness flags 12 · missing sheets 8
 *
 * A set starts at 100; each factor deducts up to its weight. The factors are
 * deliberately non-overlapping (approval = outcome, submittal = churn, RFIs vs
 * revision vs readiness-flags are distinct sources) so nothing is double-counted.
 */
import { STAGE_ORDER } from "@/components/drawings/drawingsConfig";
import { derivedSetStage, isRRStatus, pickMostRecentSubmittal } from "@/lib/submittalStageMapping";
import { selectChangedSheets } from "@/lib/revisionPackageReport";
import { daysBetween, todayLocalISO } from "@/lib/dateMath";
import { isRfiOpen } from "@/lib/entityPredicates";

export type Grade = "A" | "B" | "C" | "D" | "F";
export type BandKey = "excellent" | "good" | "at_risk" | "critical";
export type FactorSeverity = "ok" | "medium" | "high" | "critical";

export interface HealthFactor {
  key: string;
  label: string;
  weight: number; // max points this factor can cost
  deduction: number; // points lost (0..weight)
  score: number; // points kept (weight - deduction)
  severity: FactorSeverity;
  detail: string;
}

export interface DrawingHealthScore {
  setId: string | null;
  setName: string;
  score: number; // 0..100
  grade: Grade;
  band: { key: BandKey; label: string; color: string };
  stage: string; // canonical set stage (display + consistency with the Register)
  factors: HealthFactor[];
  issues: HealthFactor[]; // factors with deduction > 0, worst first
}

export interface HealthContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rfis?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revisions?: any[]; // drawing_revisions for the set's sheets (optional)
  today?: string; // local YYYY-MM-DD; defaults to today
}

const WEIGHTS = {
  openRfis: 20,
  revisionRisk: 18,
  approval: 16,
  aging: 14,
  submittal: 12,
  readiness: 12,
  missingSheets: 8,
} as const;

const TERMINAL_APPROVED = new Set(["Approved", "Approved as Noted", "Released for Fabrication"]);

const BANDS: Record<BandKey, { label: string; color: string }> = {
  excellent: { label: "Excellent", color: "#2EA043" },
  good: { label: "Good", color: "#7DBE3C" },
  at_risk: { label: "At Risk", color: "#D29922" },
  critical: { label: "Critical", color: "#F85149" },
};

function gradeFor(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function bandFor(score: number): BandKey {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "at_risk";
  return "critical";
}

function severityFor(deduction: number, weight: number): FactorSeverity {
  if (deduction <= 0) return "ok";
  const r = deduction / weight;
  if (r >= 0.66) return "critical";
  if (r >= 0.33) return "high";
  return "medium";
}

/** Normalize an RFI number for matching (strip dashes/spaces, lowercase). */
function normRfi(s: unknown): string {
  return String(s ?? "").replace(/[-\s]/g, "").toLowerCase();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countOpenRfis(sheets: any[], rfis: any[]): number {
  const linked = new Set<string>();
  for (const sheet of sheets || []) {
    const raw = sheet?.linked_rfi_ids;
    if (!raw) continue;
    for (const part of String(raw).split(/[,\s]+/)) {
      const n = normRfi(part);
      if (n) linked.add(n);
    }
  }
  if (linked.size === 0) return 0;
  let open = 0;
  for (const rfi of rfis || []) {
    if (!rfi || rfi.is_deleted) continue;
    if (!linked.has(normRfi(rfi.rfi_number))) continue;
    if (isRfiOpen(rfi)) open += 1;
  }
  return open;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setDueDate(pkg: any): string | null {
  if (pkg?.parent?.due_date) return pkg.parent.due_date;
  const dues = (pkg?.sheets || [])
    .map((s: { due_date?: string | null }) => s?.due_date)
    .filter(Boolean)
    .sort();
  return dues[0] || null;
}

/**
 * Score a single drawing set's health.
 * @param pkg a set package from buildSetPackages: { setId, name, parent, sheets, submittals }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function calculateDrawingHealthScore(pkg: any, context: HealthContext = {}): DrawingHealthScore {
  const today = context.today || todayLocalISO();
  const rfis = context.rfis || [];
  const revisions = context.revisions || [];
  const sheets = pkg?.sheets || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs = (pkg?.submittals || []).filter((s: any) => s && !s.is_deleted);
  const recent = pickMostRecentSubmittal(subs);
  const recentStatus: string | undefined = recent?.status ?? undefined;
  const stage = derivedSetStage(subs, sheets);
  // Scoring parity: R&R is a first-class derived stage (2026-07-25) but for
  // the approval deduction it scores like IFA — the approval progress reset
  // to internal prep. The dedicated R&R churn deduction below still applies.
  const stageIndex = Math.max(0, STAGE_ORDER.indexOf(stage === "R&R" ? "IFA" : stage));
  const maxIndex = STAGE_ORDER.length - 1; // 6
  const isApprovedOutcome = TERMINAL_APPROVED.has(recentStatus || "");

  // ── Approval (outcome) ──────────────────────────────────────────────
  let approvalDed: number;
  let approvalDetail: string;
  if (recentStatus === "Released for Fabrication") {
    approvalDed = 0;
    approvalDetail = "Released for fabrication";
  } else if (isApprovedOutcome) {
    approvalDed = Math.round(WEIGHTS.approval * 0.15);
    approvalDetail = `Approved (${recentStatus}) — not yet released to fab`;
  } else {
    approvalDed = Math.round(WEIGHTS.approval * (1 - stageIndex / maxIndex));
    approvalDetail = recent
      ? `In review — ${stage}`
      : sheets.length
      ? `Not submitted — ${stage}`
      : "No sheets in this set";
  }

  // ── Submittal progress (churn) ──────────────────────────────────────
  let submittalDed = 0;
  const churnBits: string[] = [];
  if (recent && isRRStatus(recentStatus)) {
    submittalDed += Math.round(WEIGHTS.submittal * 0.6);
    churnBits.push(`${recentStatus}`);
  }
  const rounds = Number(recent?.round_number) || (subs.length ? 1 : 0);
  if (rounds > 1) {
    submittalDed += Math.min(WEIGHTS.submittal, (rounds - 1) * 4);
    churnBits.push(`round ${rounds}`);
  }
  submittalDed = Math.min(WEIGHTS.submittal, submittalDed);
  const submittalDetail = churnBits.length ? `Churn: ${churnBits.join(", ")}` : "Clean submittal progress";

  // ── Open RFIs ───────────────────────────────────────────────────────
  const openCount = countOpenRfis(sheets, rfis);
  const openRfiDed = Math.min(WEIGHTS.openRfis, openCount * 8);
  const openRfiDetail = openCount ? `${openCount} open RFI${openCount === 1 ? "" : "s"} linked` : "No open RFIs";

  // ── Revision risk (needs the set's revisions; degrades to 0) ────────
  let revisionDed = 0;
  let revisionDetail = "No active revisions";
  if (Array.isArray(revisions) && revisions.length) {
    let changed: Array<{ downstream?: string | null }> = [];
    try {
      changed = selectChangedSheets(sheets, revisions, { today });
    } catch {
      changed = [];
    }
    if (changed.length) {
      const downstream = changed.filter((e) => e.downstream).length;
      revisionDed = downstream > 0 ? WEIGHTS.revisionRisk : Math.round(WEIGHTS.revisionRisk * 0.5);
      revisionDetail =
        downstream > 0
          ? `${downstream} revised sheet${downstream === 1 ? "" : "s"} already downstream — rework risk`
          : `${changed.length} sheet${changed.length === 1 ? "" : "s"} revised`;
    }
  }

  // ── Aging (overdue past the set due date; approved sets don't age) ──
  const due = setDueDate(pkg);
  let agingDed = 0;
  let daysOverdue = 0;
  if (due && !isApprovedOutcome) {
    daysOverdue = Math.max(0, daysBetween(due, today)); // today − due; >0 = overdue
    agingDed = Math.min(WEIGHTS.aging, Math.round(daysOverdue * (WEIGHTS.aging / 30)));
  }
  const agingDetail = daysOverdue > 0 ? `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue` : "On schedule";

  // ── Readiness flags (manual risk markers) ───────────────────────────
  let readinessDed = 0;
  const flags: string[] = [];
  if (pkg?.parent?.material_impacted) {
    readinessDed += 6;
    flags.push("material impact");
  }
  if (pkg?.parent?.long_lead_impact) {
    readinessDed += 6;
    flags.push("long-lead impact");
  }
  readinessDed = Math.min(WEIGHTS.readiness, readinessDed);
  const readinessDetail = flags.length ? `Flagged: ${flags.join(", ")}` : "No risk flags";

  // ── Missing sheets (expected vs present) ────────────────────────────
  const expected = Number(pkg?.parent?.sheet_count) || 0;
  const present = sheets.length;
  const missing = Math.max(0, expected - present);
  const missingDed = expected > 0 ? Math.min(WEIGHTS.missingSheets, Math.round((missing / expected) * WEIGHTS.missingSheets)) : 0;
  const missingDetail = missing > 0 ? `${missing} of ${expected} sheets missing` : "All expected sheets present";

  const mk = (key: string, label: string, weight: number, deduction: number, detail: string): HealthFactor => ({
    key,
    label,
    weight,
    deduction,
    score: Math.max(0, weight - deduction),
    severity: severityFor(deduction, weight),
    detail,
  });

  const factors: HealthFactor[] = [
    mk("openRfis", "Open RFIs", WEIGHTS.openRfis, openRfiDed, openRfiDetail),
    mk("revisionRisk", "Revision risk", WEIGHTS.revisionRisk, revisionDed, revisionDetail),
    mk("approval", "Approval status", WEIGHTS.approval, approvalDed, approvalDetail),
    mk("aging", "Aging", WEIGHTS.aging, agingDed, agingDetail),
    mk("submittal", "Submittal progress", WEIGHTS.submittal, submittalDed, submittalDetail),
    mk("readiness", "Readiness flags", WEIGHTS.readiness, readinessDed, readinessDetail),
    mk("missingSheets", "Missing sheets", WEIGHTS.missingSheets, missingDed, missingDetail),
  ];

  const totalDeduction = factors.reduce((sum, f) => sum + f.deduction, 0);
  const score = Math.max(0, Math.min(100, 100 - totalDeduction));
  const bandKey = bandFor(score);

  const issues = factors.filter((f) => f.deduction > 0).sort((a, b) => b.deduction - a.deduction);

  return {
    setId: pkg?.setId ?? null,
    setName: pkg?.name ?? "Set",
    score,
    grade: gradeFor(score),
    band: { key: bandKey, ...BANDS[bandKey] },
    stage,
    factors,
    issues,
  };
}

export interface FleetHealth {
  count: number;
  averageScore: number;
  byGrade: Record<Grade, number>;
  byBand: Record<BandKey, number>;
  worst: DrawingHealthScore[]; // lowest-scoring sets first
}

/** Roll up many set scores for the Control Board "fleet health" widget. */
export function summarizeFleetHealth(scores: DrawingHealthScore[], worstN = 5): FleetHealth {
  const list = (scores || []).filter(Boolean);
  const byGrade: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const byBand: Record<BandKey, number> = { excellent: 0, good: 0, at_risk: 0, critical: 0 };
  let sum = 0;
  for (const s of list) {
    byGrade[s.grade] += 1;
    byBand[s.band.key] += 1;
    sum += s.score;
  }
  const worst = list.slice().sort((a, b) => a.score - b.score).slice(0, worstN);
  return {
    count: list.length,
    averageScore: list.length ? Math.round(sum / list.length) : 100,
    byGrade,
    byBand,
    worst,
  };
}
