/**
 * pickSummaryFormat.ts — one source of truth for how a captured pick is worded.
 *
 * The Pick Summary leaves this app three ways: the on-screen modal, the
 * clipboard text, and the PDF. Each used to format its own numbers, which is
 * how a printed lift plan ends up disagreeing with the screen it was taken
 * from. Every figure and every caveat now comes from here, so the three
 * artifacts can only ever say the same thing.
 *
 * Nothing in this module computes engineering values. It reads a snapshot
 * produced by the calculator and renders it; the math lives in
 * utils/cranePickMath.ts and utils/riggingCalculations.js.
 */

export const STATUS_LABEL: Record<string, string> = {
  green: "OK",
  yellow: "CAUTION",
  red: "CRITICAL",
};

/** A pick snapshot. Fields are optional because snapshots persist across app
 *  versions — an older one legitimately lacks fields added later. */
export interface PickSnapshot {
  capturedAt?: string;
  pieceWeight?: number;
  riggingWeight?: number;
  hookBlockWeight?: number;
  otherDeductions?: number;
  slingLoad?: number;
  totalLoad?: number;
  numLegs?: number;
  angleDegrees?: number;
  laf?: number;
  tensionPerLeg?: number;
  cgMode?: string;
  offset?: {
    tension1: number; tension2: number;
    angle1: number; angle2: number;
    share1: number; share2: number;
    H: number; d1: number; d2: number;
  } | null;
  legsAssumedCarrying?: number;
  slingWll?: number; slingUtil?: number;
  shackleWll?: number; shackleUtil?: number;
  liftType?: string;
  craneCapacity?: number;
  utilization?: number;
  capacityStatus?: string | null;
  angleStatus?: string | null;
  warnings?: { severity: "red" | "yellow"; message: string }[];
  boomAngle?: number;
  tipHeight?: number;
  craneModel?: string;
  counterweight?: string;
  boomLength?: string | number;
  workingRadius?: string | number;
  capacitySource?: string;
  chart?: {
    serial?: string;
    configuration?: string;
    summary?: string;
    source?: string;
    basis?: string;
    exact?: boolean;
  } | null;
}

const OFFSET_MODE = "offset";
const PERSONNEL = "personnel";
const MANUAL = "manual";

const finite = (n: unknown): n is number => Number.isFinite(Number(n));

export function lbOrDash(n: unknown): string {
  if (!finite(n)) return "—";
  return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`;
}

/** US short tons. */
export function tonsOrDash(n: unknown): string {
  if (!finite(n)) return "—";
  return `${(Number(n) / 2000).toFixed(3)} T`;
}

export function pctOrDash(n: unknown): string {
  return finite(n) ? `${Number(n).toFixed(1)}%` : "—";
}

export function degOrDash(n: unknown): string {
  return finite(n) ? `${Number(n).toFixed(1)}°` : "—";
}

/** When the pick was captured — a recalled pick must never show "now". */
export function capturedLabel(d: PickSnapshot | null | undefined): string {
  if (d?.capturedAt) {
    const t = new Date(d.capturedAt);
    if (!Number.isNaN(t.getTime())) return t.toLocaleString();
  }
  return "Capture time not recorded";
}

/**
 * "4 (2 assumed carrying)" — the leg count with the load-sharing assumption
 * attached, because the summary is what ends up in a lift plan.
 */
export function legsSummaryValue(d: PickSnapshot | null | undefined): string {
  const legs = Number(d?.numLegs);
  const carrying = Number(d?.legsAssumedCarrying);
  const offset = d?.cgMode === OFFSET_MODE ? " — offset CG" : "";
  if (Number.isFinite(carrying) && Number.isFinite(legs) && carrying !== legs) {
    return `${legs} (${carrying} assumed carrying)${offset}`;
  }
  return `${d?.numLegs ?? "—"}${offset}`;
}

/**
 * The line printed under "Tension per Leg".
 *
 * A 4-leg snapshot recalled from the history tape that predates the rigid-load
 * fix has no `legsAssumedCarrying`, and its stored tension divided the load by
 * FOUR — understated by exactly 2x. Recalculating it here would silently
 * rewrite a recorded pick, so the stale value is labelled instead.
 */
export function legsCarryingNote(d: PickSnapshot | null | undefined): string {
  if (Number(d?.numLegs) !== 4) return "";
  if (!Number.isFinite(Number(d?.legsAssumedCarrying))) {
    return "⚠ RECORDED BEFORE THE 4-LEG CORRECTION — this tension assumed all 4 legs shared the load and is understated by ~2x. Re-run this pick before using it.";
  }
  return "Rigid load: only 2 of 4 legs assumed carrying (ASME B30.9). Rate every leg for the full value above.";
}

/** Picks saved before hook-block deductions existed excluded the block. */
export function grossLoadNote(d: PickSnapshot | null | undefined): string {
  if (d && d.slingLoad === undefined) {
    return "⚠ RECORDED BEFORE HOOK-BLOCK DEDUCTIONS WERE SUPPORTED — this load excludes the hook block and chart deductions, so utilization may be understated. Re-run this pick.";
  }
  return "";
}

export function liftTypeLabel(d: PickSnapshot | null | undefined): string {
  return d?.liftType === PERSONNEL
    ? "Personnel platform (50% limit, 29 CFR 1926.1431)"
    : "Standard";
}

export function tensionLabel(d: PickSnapshot | null | undefined): string {
  if (Number(d?.numLegs) === 1) return "Tension (single leg)";
  return d?.offset ? "Max Leg Tension" : "Tension per Leg";
}

export const DISCLAIMER_HEAD = "PLANNING TOOL ONLY";
export const DISCLAIMER_BODY =
  "Does not replace an engineered lift plan. Verify all values against the crane load chart and rigging capacity ratings.";

export interface SummaryRowData {
  k: string;
  v: string;
  /** Headline figure — rendered heavier. */
  bold?: boolean;
  /** A caveat about the value above it, not a value of its own. */
  note?: boolean;
}
export interface SummarySectionData {
  title: string;
  rows: SummaryRowData[];
}

/**
 * The whole summary as ordered sections. The modal, the clipboard text and the
 * PDF all render this, so a field can only appear — or be worded — one way.
 */
export function pickSummarySections(d: PickSnapshot): SummarySectionData[] {
  const sections: SummarySectionData[] = [];

  const load: SummaryRowData[] = [
    { k: "Piece Weight", v: lbOrDash(d.pieceWeight) },
    { k: "Rigging Weight", v: lbOrDash(d.riggingWeight) },
  ];
  if (d.slingLoad !== undefined) {
    load.push({ k: "Load on Slings", v: `${lbOrDash(d.slingLoad)} (${tonsOrDash(d.slingLoad)})` });
    load.push({ k: "Hook Block / Ball", v: lbOrDash(d.hookBlockWeight) });
    load.push({ k: "Other Chart Deductions", v: lbOrDash(d.otherDeductions) });
  }
  load.push({ k: "Gross Load (vs. chart)", v: `${lbOrDash(d.totalLoad)} (${tonsOrDash(d.totalLoad)})`, bold: true });
  const gNote = grossLoadNote(d);
  if (gNote) load.push({ k: "", v: gNote, note: true });
  sections.push({ title: "Load", rows: load });

  const rig: SummaryRowData[] = [{ k: "Number of Legs", v: legsSummaryValue(d) }];
  if (d.offset) {
    rig.push({ k: "Geometry", v: `H ${d.offset.H} ft · CG→pick 1 ${d.offset.d1} ft · CG→pick 2 ${d.offset.d2} ft` });
    rig.push({ k: "Leg 1", v: `${lbOrDash(d.offset.tension1)} @ ${degOrDash(d.offset.angle1)} (${(d.offset.share1 * 100).toFixed(0)}% of vertical)` });
    rig.push({ k: "Leg 2", v: `${lbOrDash(d.offset.tension2)} @ ${degOrDash(d.offset.angle2)} (${(d.offset.share2 * 100).toFixed(0)}% of vertical)` });
  } else {
    rig.push({ k: "Sling Angle", v: Number(d.numLegs) === 1 ? "Single vertical pick" : degOrDash(d.angleDegrees) });
    rig.push({ k: "Load Angle Factor (LAF)", v: finite(d.laf) ? Number(d.laf).toFixed(3) : "—" });
  }
  rig.push({ k: tensionLabel(d), v: `${lbOrDash(d.tensionPerLeg)} (${tonsOrDash(d.tensionPerLeg)})`, bold: true });
  const cNote = legsCarryingNote(d);
  if (cNote) rig.push({ k: "", v: cNote, note: true });
  if (finite(d.slingUtil)) rig.push({ k: "Sling WLL / Utilization", v: `${lbOrDash(d.slingWll)} · ${pctOrDash(d.slingUtil)}` });
  if (finite(d.shackleUtil)) rig.push({ k: "Shackle WLL / Utilization", v: `${lbOrDash(d.shackleWll)} · ${pctOrDash(d.shackleUtil)}` });
  sections.push({ title: "Rigging Configuration", rows: rig });

  const cap: SummaryRowData[] = [];
  if (d.liftType) cap.push({ k: "Lift Type", v: liftTypeLabel(d) });
  cap.push({ k: "Rated Crane Capacity", v: lbOrDash(d.craneCapacity) });
  if (d.chart) {
    cap.push({ k: "Capacity Source", v: `Load chart — ${d.chart.configuration ?? "—"}` });
    cap.push({ k: "Chart", v: d.chart.summary ?? "—" });
    cap.push({ k: "Chart Reference", v: d.chart.source ?? "—" });
    if (d.chart.serial) cap.push({ k: "Crane S/N", v: d.chart.serial });
    cap.push({ k: "Chart Reading", v: d.chart.basis ?? "—" });
  } else if (d.capacitySource === MANUAL) {
    cap.push({ k: "Capacity Source", v: "Entered by hand" });
  }
  cap.push({
    k: "Utilization",
    v: `${pctOrDash(d.utilization)} (${STATUS_LABEL[String(d.capacityStatus)] || "—"})`,
    bold: true,
  });
  sections.push({ title: "Capacity", rows: cap });

  if (d.craneModel || d.boomLength || d.workingRadius || d.counterweight) {
    const crane: SummaryRowData[] = [];
    if (d.craneModel) crane.push({ k: "Make / Model", v: String(d.craneModel) });
    if (d.boomLength) crane.push({ k: "Boom Length", v: `${d.boomLength} ft` });
    if (d.workingRadius) crane.push({ k: "Working Radius", v: `${d.workingRadius} ft` });
    if (finite(d.boomAngle)) crane.push({ k: "Boom Angle (approx.)", v: degOrDash(d.boomAngle) });
    if (finite(d.tipHeight)) crane.push({ k: "Tip Height above Foot (approx.)", v: `${Number(d.tipHeight).toFixed(1)} ft` });
    if (d.counterweight) crane.push({ k: "Counterweight", v: String(d.counterweight) });
    sections.push({ title: "Crane", rows: crane });
  }

  return sections;
}

/** Warnings, always an array — a legacy snapshot may carry none. */
export function pickWarnings(d: PickSnapshot): { severity: "red" | "yellow"; message: string }[] {
  return Array.isArray(d?.warnings) ? d.warnings : [];
}

/** The clipboard / email form of the summary, rendered from the same sections. */
export function buildSummaryText(d: PickSnapshot): string {
  const lines: string[] = [];
  lines.push(`PICK SUMMARY — ${DISCLAIMER_HEAD}`);
  lines.push(DISCLAIMER_BODY);
  lines.push(capturedLabel(d));

  for (const section of pickSummarySections(d)) {
    lines.push("");
    lines.push(section.title.toUpperCase());
    for (const row of section.rows) {
      if (!row.k) lines.push(`    ${row.v}`);
      else lines.push(`  ${(row.k + ":").padEnd(28)}${row.v}`);
    }
  }

  const warnings = pickWarnings(d);
  if (warnings.length) {
    lines.push("");
    lines.push("WARNINGS");
    warnings.forEach((w) => lines.push(`  [${String(w.severity).toUpperCase()}] ${w.message}`));
  }
  return lines.join("\n");
}
