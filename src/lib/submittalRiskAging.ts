/**
 * submittalRiskAging.ts — R&R / OFS / BFA risk tiers (Slice 7).
 *
 * Pure derive: Normal → Attention → Urgent → Critical from working-day
 * countdown to due (or days-stuck when no due). Never writes alerts.
 */
import { todayLocalISO } from "@/lib/dateMath";
import { workingDaysBetween } from "@/lib/workingDays";
import { workdaysUntil } from "@/pages/drawingSubmittalHub/format";

export const RISK_AGING_STAGES: ReadonlySet<string> = new Set(["R&R", "OFS", "BFA"]);

export type SubmittalRiskTier = "normal" | "attention" | "urgent" | "critical";

export const RISK_AGING_THRESHOLDS = {
  /** Working days left ≤ this (and > urgent) → Attention. */
  ATTENTION_MAX_WD: 5,
  /** Working days left ≤ this (and > 0) → Urgent. */
  URGENT_MAX_WD: 2,
  /** Days stuck without a due date → Urgent. */
  STUCK_URGENT_WD: 3,
  /** Days stuck without a due date → Critical. */
  STUCK_CRITICAL_WD: 6,
} as const;

export interface SubmittalRiskAgingInput {
  stage: string | null | undefined;
  dueDate?: string | null;
  /** ISO date or timestamp when the package entered this stage / status. */
  statusChangedAt?: string | null;
  today?: string;
  useWorkdays?: boolean;
  /** True when fab / on-site dates are already threatened by this package. */
  threateningFab?: boolean;
}

export interface SubmittalRiskAssessment {
  tier: SubmittalRiskTier;
  label: string;
  stage: string;
  daysUntilDue: number | null;
  daysInStatus: number | null;
  tone: "danger" | "warn" | "info" | "neutral";
  reason: string;
}

function calendarDaysUntil(dueDate: string, today: string): number | null {
  const dueMatch = String(dueDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const todayMatch = String(today).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dueMatch || !todayMatch) return null;
  const due = new Date(Number(dueMatch[1]), Number(dueMatch[2]) - 1, Number(dueMatch[3]));
  const now = new Date(Number(todayMatch[1]), Number(todayMatch[2]) - 1, Number(todayMatch[3]));
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

function daysBetween(start: string, end: string, useWorkdays: boolean): number | null {
  const startDay = String(start).match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const endDay = String(end).match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!startDay || !endDay) return null;
  if (useWorkdays) {
    return workingDaysBetween(startDay, endDay);
  }
  return calendarDaysUntil(endDay, startDay);
}

function tierFromCountdown(daysLeft: number): SubmittalRiskTier {
  if (daysLeft <= 0) return "critical";
  if (daysLeft <= RISK_AGING_THRESHOLDS.URGENT_MAX_WD) return "urgent";
  if (daysLeft <= RISK_AGING_THRESHOLDS.ATTENTION_MAX_WD) return "attention";
  return "normal";
}

function tierFromStuck(daysStuck: number): SubmittalRiskTier {
  if (daysStuck >= RISK_AGING_THRESHOLDS.STUCK_CRITICAL_WD) return "critical";
  if (daysStuck >= RISK_AGING_THRESHOLDS.STUCK_URGENT_WD) return "urgent";
  if (daysStuck >= 1) return "attention";
  return "normal";
}

function presentation(
  tier: SubmittalRiskTier,
  stage: string,
  reason: string,
): Pick<SubmittalRiskAssessment, "label" | "tone" | "reason"> {
  const labels: Record<SubmittalRiskTier, string> = {
    critical: `Critical — ${stage}`,
    urgent: `Urgent — ${stage}`,
    attention: `Attention — ${stage}`,
    normal: `Normal — ${stage}`,
  };
  const tones: Record<SubmittalRiskTier, SubmittalRiskAssessment["tone"]> = {
    critical: "danger",
    urgent: "warn",
    attention: "info",
    normal: "neutral",
  };
  return { label: labels[tier], tone: tones[tier], reason };
}

/**
 * Score aging risk for a time-sensitive workflow stage. Returns null when
 * the stage is outside R&R / OFS / BFA.
 */
export function computeSubmittalRiskAging(
  input: SubmittalRiskAgingInput,
): SubmittalRiskAssessment | null {
  const stage = String(input.stage ?? "").trim();
  if (!RISK_AGING_STAGES.has(stage)) return null;

  const today = input.today || todayLocalISO();
  const useWorkdays = input.useWorkdays !== false;
  const daysInStatus = input.statusChangedAt
    ? daysBetween(input.statusChangedAt, today, useWorkdays)
    : null;

  if (input.threateningFab) {
    return {
      tier: "critical",
      stage,
      daysUntilDue: input.dueDate
        ? useWorkdays
          ? workdaysUntil(input.dueDate, today)
          : calendarDaysUntil(input.dueDate, today)
        : null,
      daysInStatus,
      ...presentation("critical", stage, "Threatening fabrication or on-site dates."),
    };
  }

  if (input.dueDate) {
    const daysUntilDue = useWorkdays
      ? workdaysUntil(input.dueDate, today)
      : calendarDaysUntil(input.dueDate, today);
    if (daysUntilDue == null) {
      // Fall through to stuck logic when due is unparseable.
    } else {
      const tier = tierFromCountdown(daysUntilDue);
      const unit = useWorkdays ? "wd" : "d";
      const reason =
        daysUntilDue < 0
          ? `${Math.abs(daysUntilDue)}${unit} overdue`
          : daysUntilDue === 0
            ? "Due today"
            : `${daysUntilDue}${unit} until required date`;
      return {
        tier,
        stage,
        daysUntilDue,
        daysInStatus,
        ...presentation(tier, stage, reason),
      };
    }
  }

  if (daysInStatus != null) {
    const tier = tierFromStuck(daysInStatus);
    const unit = useWorkdays ? "wd" : "d";
    return {
      tier,
      stage,
      daysUntilDue: null,
      daysInStatus,
      ...presentation(tier, stage, `${daysInStatus}${unit} in ${stage} with no required date`),
    };
  }

  return {
    tier: "normal",
    stage,
    daysUntilDue: null,
    daysInStatus: null,
    ...presentation("normal", stage, "No required date or status age available."),
  };
}
