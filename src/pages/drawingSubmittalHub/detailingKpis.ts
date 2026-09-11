/**
 * Detailing Control Center KPIs: pure builders for the numbers the header
 * used to carry on every tab.
 *
 * Owner decision 2 (2026-09-11) adopted 2026's compact header, and the KPI
 * strip moved into the Control Board tab. buildDetailingKpiCells is the
 * shell's old kpiCells, lifted unchanged: the em-dash pending rule, the scoped
 * "Submittals Needing Action" label and the overdue sublabels are all
 * byte-identical. The other tabs show buildStatusLine under the header.
 *
 * No React here beyond the icon references the strip renders.
 */
import { AlertTriangle, CalendarClock, CheckCircle, ClipboardList, FileStack, Gauge } from "lucide-react";
import type { ReactNode } from "react";
import type { KpiCellDef, KpiTone } from "@/components/command";

/** Real KPI numbers lifted from the hub's computed values. */
export interface DetailingKpis {
  totalSets: number;
  totalSheets: number;
  released: number;
  inReview: number;
  submittalsTotal: number;
  submittalsPending: number;
  needsAction: number;   // kpis.rejected in hub (rejected/returned submittals)
  overdue: number;
  atRisk: number;
  overdueDrawingSets: number;
  overdueUnlinkedSubmittals: number;
  fabReadyNumerator: number;
  fabReadyDenominator: number;
  fabReadyPercent: number;
  openItems: number;      // triage.openItems.length
  fleetAverageScore: number | null; // from fleetHealth.averageScore (null if no data)
}

/** "Not known yet." A 0 means "we checked, there are none". */
export const KPI_PENDING = "—";

/**
 * Every overdue item on the board, both kinds. buildTriage partitions its
 * `overdue` bucket into these two disjoint counts.
 */
export function totalOverdue(kpis: DetailingKpis): number {
  return kpis.overdueDrawingSets + kpis.overdueUnlinkedSubmittals;
}

/**
 * The Control Board's KPI strip.
 *
 * While the queries are in flight every count is 0, and rendering those as
 * finished numbers made the band assert "Nothing overdue" / "Released 0" on
 * every cold load — reliably, when navigating in from Drawings, because the
 * hub's own ["drawing-sets"] key is cold while ["drawings"] is already warm.
 * An em dash says "not known yet"; a 0 says "we checked, there are none".
 */
export function buildDetailingKpiCells(kpis: DetailingKpis, pending: boolean): KpiCellDef[] {
  const num = (v: number): ReactNode => (pending ? KPI_PENDING : v);
  const tone = (t: KpiTone): KpiTone => (pending ? "neutral" : t);
  const overdue = totalOverdue(kpis);

  // Mapping → real hub computed values; tones are deterministic (not fabricated).
  return [
    {
      label: "Drawing Sets",
      value: num(kpis.totalSets),
      sublabel: pending ? "loading…" : `${kpis.totalSheets} active sheets`,
      tone: "neutral",
      Icon: FileStack,
    },
    {
      label: "Released",
      value: num(kpis.released),
      sublabel: "sets to fab",
      tone: tone("good"),
      Icon: CheckCircle,
    },
    {
      label: "In Review",
      value: num(kpis.inReview),
      tone: tone(kpis.inReview > 0 ? "info" : "neutral"),
      Icon: Gauge,
    },
    {
      label: "Submittals",
      value: num(kpis.submittalsTotal),
      sublabel: pending ? "loading…" : `${kpis.submittalsPending} pending`,
      tone: "neutral",
      Icon: ClipboardList,
    },
    {
      // Scoped in the label: this counts rejected/returned SUBMITTAL rows, while
      // the Control Board's own "Items Needing Action" tile counts triage items.
      // Two different denominators under one name read as a contradiction (3 vs 2).
      label: "Submittals Needing Action",
      value: num(kpis.needsAction),
      sublabel: "rejected / returned",
      tone: tone(kpis.needsAction > 0 ? "warn" : "neutral"),
      Icon: AlertTriangle,
    },
    {
      // Counts BOTH overdue kinds, with the split in the sublabel. It used to
      // show the drawing-set count under a sublabel that named both ("3 sets ·
      // 2 unlinked" beside a value of 3), so the tile under-reported the work.
      label: "Overdue",
      value: num(overdue),
      sublabel: (() => {
        if (pending) return "loading…";
        if (kpis.overdueDrawingSets > 0 && kpis.overdueUnlinkedSubmittals > 0)
          return `${kpis.overdueDrawingSets} sets · ${kpis.overdueUnlinkedSubmittals} unlinked subs`;
        if (kpis.overdueUnlinkedSubmittals > 0)
          return `${kpis.overdueUnlinkedSubmittals} unlinked subs`;
        if (kpis.overdueDrawingSets > 0)
          return `${kpis.overdueDrawingSets} drawing sets`;
        return "sets + unlinked submittals";
      })(),
      tone: tone(overdue > 0 ? "danger" : "neutral"),
      Icon: CalendarClock,
    },
    {
      label: "At Risk",
      value: num(kpis.atRisk),
      sublabel: "schedule risk",
      tone: tone(kpis.atRisk > 0 ? "warn" : "neutral"),
    },
  ];
}

/**
 * One compact line for the tabs that don't show the KPI strip:
 * "4 sets · 2 open · 5 overdue · 1 at risk · Fab Ready 1/4". Same numbers as
 * the old header chips and Fab Ready stat, with the same em-dash rule while
 * loading. Fab Ready is also "—" when no sheet counts toward it, as the old
 * header stat was.
 */
export function buildStatusLine(kpis: DetailingKpis, pending: boolean): string {
  const num = (v: number): string => (pending ? KPI_PENDING : String(v));
  const sets = !pending && kpis.totalSets === 1 ? "set" : "sets";
  const fabReady = !pending && kpis.fabReadyDenominator > 0
    ? `${kpis.fabReadyNumerator}/${kpis.fabReadyDenominator}`
    : KPI_PENDING;
  return [
    `${num(kpis.totalSets)} ${sets}`,
    `${num(kpis.openItems)} open`,
    `${num(totalOverdue(kpis))} overdue`,
    `${num(kpis.atRisk)} at risk`,
    `Fab Ready ${fabReady}`,
  ].join(" · ");
}
