/**
 * loadChart.ts — the crane's rated-capacity chart, and reading a capacity off it.
 *
 * A mobile crane's rated capacity is not one number. It is a table in the
 * manufacturer's chart book, one table per CONFIGURATION (counterweight,
 * outrigger extension, area of operation, jib), indexed by boom length and
 * working radius. The operator's job — and this module's — is to find the
 * right cell and read it correctly.
 *
 * "Correctly" is the whole point, and it is conservative in every direction:
 *
 *   - NEVER EXTRAPOLATE. A radius past the chart's last column, or a boom
 *     longer than its last row, is simply not rated. Extending the trend line
 *     is how a crane goes over.
 *   - NEVER INTERPOLATE UPWARD. Between two listed radii (or boom lengths) the
 *     capacity is the LOWER of the bracketing cells. Manufacturer chart notes
 *     phrase this as "use the next longer radius / next longer boom"; taking
 *     the minimum of the bracketing cells gives the same answer on a normal
 *     chart and stays safe on one whose numbers are not monotonic.
 *   - A BLANK CELL IS "NOT RATED", NOT ZERO AND NOT MISSING DATA. The
 *     manufacturer left it blank because that combination is not permitted
 *     (boom angle, stability, structural). If any bracketing cell is blank the
 *     position is not rated — we will not reach across a hole in the chart.
 *   - LATTICE BOOMS ONLY EXIST AT LISTED LENGTHS. A telescopic boom can sit
 *     between two chart rows; a lattice boom is built from sections and
 *     cannot. An unlisted length on a lattice crane is refused, not rounded.
 *
 * Every refusal says why, in words an operator can act on.
 *
 * This module holds no manufacturer data. Charts are entered by the crane
 * owner from the chart book for THEIR machine — the capacities belong to the
 * manufacturer and to that crane's serial number and configuration, and a
 * number that merely looks right is the most dangerous kind.
 *
 * Units: boom length and radius in feet, capacity in pounds (gross, per ASME
 * B30.5 — the chart rates hook block, rigging and chart deductions as part of
 * the load; see grossLoadForChart in utils/cranePickMath).
 */
import { parseNumericInput } from "@/utils/cranePickMath";

export type BoomType = "telescopic" | "lattice";

/**
 * One configuration's chart. `capacities[i][j]` is the rated capacity in lb at
 * `boomLengths[i]` and `radii[j]`, or `null` where the chart is blank.
 */
export interface LoadChart {
  boomLengths: number[];
  radii: number[];
  capacities: (number | null)[][];
}

export interface ChartCell {
  boomLength: number;
  radius: number;
  capacity: number;
}

export type ChartRefusal =
  | "invalid-input"
  | "boom-below-chart"
  | "boom-beyond-chart"
  | "boom-not-listed"
  | "radius-below-chart"
  | "radius-beyond-chart"
  | "not-rated";

export type ChartLookup =
  | {
      ok: true;
      /** Rated gross capacity to compare the gross load against, lb. */
      capacity: number;
      /** The cell whose value governs (the lowest of the bracketing cells). */
      governing: ChartCell;
      /** Every cell that bracketed the requested position. */
      bracketing: ChartCell[];
      /** True when the requested boom length and radius are both listed. */
      exact: boolean;
      /** One sentence saying which cell was used and why. */
      basis: string;
    }
  | { ok: false; reason: ChartRefusal; message: string };

/** Indices bracketing `value` in an ascending list, or why it has none. */
type Bracket =
  | { ok: true; indices: number[]; exact: boolean }
  | { ok: false; side: "below" | "beyond" };

function bracket(values: number[], value: number): Bracket {
  const first = values[0];
  const last = values[values.length - 1];
  if (value < first) return { ok: false, side: "below" };
  if (value > last) return { ok: false, side: "beyond" };
  const hit = values.indexOf(value);
  if (hit !== -1) return { ok: true, indices: [hit], exact: true };
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] < value && value < values[i + 1]) {
      return { ok: true, indices: [i, i + 1], exact: false };
    }
  }
  // Backstop: anything the loop could not bracket is refused, never clamped to
  // the nearest listed value. The explicit range checks above already catch
  // every such value on a valid axis; this line is what makes extrapolation
  // impossible even if one of them is edited away.
  return { ok: false, side: "beyond" };
}

const ft = (n: number) => `${n.toLocaleString("en-US")} ft`;
const lb = (n: number) => `${Math.round(n).toLocaleString("en-US")} lb`;

/**
 * Rated capacity at a boom length and working radius, read conservatively.
 *
 * The chart must already be valid (see validateLoadChart); an invalid chart
 * is refused as invalid-input rather than read.
 */
export function lookupRatedCapacity(
  chart: LoadChart,
  boomLength: number,
  radius: number,
  boomType: BoomType = "telescopic",
): ChartLookup {
  if (!Number.isFinite(boomLength) || !Number.isFinite(radius) || !(boomLength > 0) || !(radius > 0)) {
    return { ok: false, reason: "invalid-input", message: "Enter a boom length and working radius greater than zero." };
  }
  if (validateLoadChart(chart).errors.length > 0) {
    return { ok: false, reason: "invalid-input", message: "This load chart has errors and cannot be read. Fix it in the crane library." };
  }

  const { boomLengths, radii, capacities } = chart;

  const b = bracket(boomLengths, boomLength);
  if (b.ok === false) {
    return b.side === "below"
      ? { ok: false, reason: "boom-below-chart", message: `${ft(boomLength)} boom is shorter than this chart's shortest boom (${ft(boomLengths[0])}). Not rated.` }
      : { ok: false, reason: "boom-beyond-chart", message: `${ft(boomLength)} boom is longer than this chart's longest boom (${ft(boomLengths[boomLengths.length - 1])}). Not rated — the chart is never extrapolated.` };
  }
  if (!b.exact && boomType === "lattice") {
    const [lo, hi] = b.indices;
    return {
      ok: false,
      reason: "boom-not-listed",
      message: `A lattice boom is built from sections and can only be rigged at a listed length. ${ft(boomLength)} is not listed — rig ${ft(boomLengths[lo])} or ${ft(boomLengths[hi])}.`,
    };
  }

  const r = bracket(radii, radius);
  if (r.ok === false) {
    return r.side === "below"
      ? { ok: false, reason: "radius-below-chart", message: `${ft(radius)} is inside this chart's minimum radius (${ft(radii[0])}). Not rated at this boom angle.` }
      : { ok: false, reason: "radius-beyond-chart", message: `${ft(radius)} is past this chart's last radius (${ft(radii[radii.length - 1])}). Not rated — the chart is never extrapolated.` };
  }

  const cells: ChartCell[] = [];
  for (const i of b.indices) {
    for (const j of r.indices) {
      const c = capacities[i][j];
      if (c === null) {
        return {
          ok: false,
          reason: "not-rated",
          message: `The chart is blank at ${ft(boomLengths[i])} boom / ${ft(radii[j])} radius. A blank cell means the manufacturer does not rate that position${b.exact && r.exact ? "" : ", and a capacity is never read across one"}.`,
        };
      }
      cells.push({ boomLength: boomLengths[i], radius: radii[j], capacity: c });
    }
  }

  const governing = cells.reduce((min, c) => (c.capacity < min.capacity ? c : min));
  const exact = b.exact && r.exact;

  let basis: string;
  if (exact) {
    basis = `${lb(governing.capacity)} read directly at ${ft(governing.boomLength)} boom / ${ft(governing.radius)} radius.`;
  } else {
    const between: string[] = [];
    if (!b.exact) between.push(`boom length between ${ft(boomLengths[b.indices[0]])} and ${ft(boomLengths[b.indices[1]])}`);
    if (!r.exact) between.push(`radius between ${ft(radii[r.indices[0]])} and ${ft(radii[r.indices[1]])}`);
    basis = `${lb(governing.capacity)} from ${ft(governing.boomLength)} boom / ${ft(governing.radius)} radius — ${between.join(" and ")}, so the lower bracketing rating governs. Not interpolated.`;
  }

  return { ok: true, capacity: governing.capacity, governing, bracketing: cells, exact, basis };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface ChartIssue {
  message: string;
}

export interface ChartValidation {
  /** Make the chart unreadable. lookupRatedCapacity refuses a chart with any. */
  errors: ChartIssue[];
  /** Readable, but probably a data-entry mistake worth a second look. */
  warnings: ChartIssue[];
}

function isStrictlyAscending(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) if (!(values[i] > values[i - 1])) return false;
  return true;
}

/**
 * Structural checks (errors) and plausibility checks (warnings).
 *
 * The one warning worth explaining: for a given boom length, rated capacity
 * does not go UP as the radius goes out — moving the load away from the
 * crane only ever costs capacity. A cell larger than the one before it is
 * almost always a typo (a dropped or extra zero), and a dropped zero at the
 * cell you lift from is a 10x overload. It stays a warning, not an error, so
 * an unusual but genuine chart is not blocked.
 */
export function validateLoadChart(chart: LoadChart): ChartValidation {
  const errors: ChartIssue[] = [];
  const warnings: ChartIssue[] = [];
  const { boomLengths, radii, capacities } = chart ?? ({} as LoadChart);

  if (!Array.isArray(boomLengths) || boomLengths.length === 0) errors.push({ message: "The chart needs at least one boom length." });
  if (!Array.isArray(radii) || radii.length === 0) errors.push({ message: "The chart needs at least one radius." });
  if (errors.length) return { errors, warnings };

  if (!boomLengths.every((v) => Number.isFinite(v) && v > 0)) errors.push({ message: "Every boom length must be a number greater than zero." });
  if (!radii.every((v) => Number.isFinite(v) && v > 0)) errors.push({ message: "Every radius must be a number greater than zero." });
  if (!isStrictlyAscending(boomLengths)) errors.push({ message: "Boom lengths must be listed shortest to longest, with no repeats." });
  if (!isStrictlyAscending(radii)) errors.push({ message: "Radii must be listed closest to farthest, with no repeats." });

  if (!Array.isArray(capacities) || capacities.length !== boomLengths.length) {
    errors.push({ message: `The chart has ${boomLengths.length} boom length${boomLengths.length === 1 ? "" : "s"} but ${Array.isArray(capacities) ? capacities.length : 0} row${Array.isArray(capacities) && capacities.length === 1 ? "" : "s"} of capacities.` });
    return { errors, warnings };
  }

  let anyRated = false;
  capacities.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== radii.length) {
      errors.push({ message: `Boom ${ft(boomLengths[i])}: expected ${radii.length} capacit${radii.length === 1 ? "y" : "ies"}, found ${Array.isArray(row) ? row.length : 0}.` });
      return;
    }
    row.forEach((c, j) => {
      if (c === null) return;
      if (!Number.isFinite(c) || !(c > 0)) {
        errors.push({ message: `Boom ${ft(boomLengths[i])} / radius ${ft(radii[j])}: capacity must be a number greater than zero, or blank for not rated.` });
        return;
      }
      anyRated = true;
    });

    let prev: { radius: number; capacity: number } | null = null;
    row.forEach((c, j) => {
      if (c === null || !Number.isFinite(c)) return;
      if (prev && c > prev.capacity) {
        warnings.push({
          message: `Boom ${ft(boomLengths[i])}: capacity rises from ${lb(prev.capacity)} at ${ft(prev.radius)} to ${lb(c)} at ${ft(radii[j])}. Capacity should not increase as the radius goes out — check this cell for a typo.`,
        });
      }
      prev = { radius: radii[j], capacity: c };
    });
  });

  if (!anyRated && errors.length === 0) errors.push({ message: "Every cell is blank — the chart rates nothing." });
  return { errors, warnings };
}

// ─── Paste / CSV import ─────────────────────────────────────────────────────

export interface ParsedChart {
  chart: LoadChart | null;
  errors: string[];
}

/** Cells that mean "blank on the chart" when pasted from a spreadsheet. */
const NOT_RATED_TOKENS = new Set(["", "-", "–", "—", "n/a", "na", "nr", "*"]);

/**
 * Parse a chart pasted from a spreadsheet or typed as CSV.
 *
 *   Boom \ Radius,  10,     15,     20
 *   40,             100000, 80000,  60000
 *   60,             90000,  70000,  -
 *
 * The first row lists radii (its first cell is a label and is ignored); each
 * later row is a boom length followed by its capacities. A blank or dash cell
 * is "not rated".
 *
 * Separator: a TAB if the text contains any (what copying from Excel or the
 * PDF-to-spreadsheet route produces), otherwise a comma. Thousands separators
 * like "12,500" are therefore only safe in tab-separated input — in CSV the
 * comma is the separator, so "12,500" would split into two cells. Numbers use
 * the same strict parser as the rest of the calculator: "12k" or "12.500,5" is
 * rejected with its row and column, never guessed at.
 */
export function parseChartText(text: string): ParsedChart {
  const errors: string[] = [];
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { chart: null, errors: ["Paste a header row of radii and at least one row of boom length + capacities."] };
  }

  const sep = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim()));

  const radii: number[] = [];
  rows[0].slice(1).forEach((cell, j) => {
    const v = parseNumericInput(cell);
    if (!Number.isFinite(v)) errors.push(`Header row, column ${j + 2}: "${cell}" is not a radius.`);
    else radii.push(v);
  });

  const boomLengths: number[] = [];
  const capacities: (number | null)[][] = [];
  rows.slice(1).forEach((row, r) => {
    const lineNo = r + 2;
    const boom = parseNumericInput(row[0]);
    if (!Number.isFinite(boom)) {
      errors.push(`Row ${lineNo}: "${row[0]}" is not a boom length.`);
      return;
    }
    const cells = row.slice(1);
    if (cells.length > radii.length) {
      // In CSV, "12,500" splits into "12" and "500" — both valid numbers — so
      // a thousands separator surfaces here, as an extra column, not as an
      // unparseable cell. Silently taking the first N cells would shift every
      // capacity one column left and rate each radius at its neighbour's value.
      errors.push(
        `Row ${lineNo} (boom ${boom} ft) has ${cells.length} capacities but the header lists ${radii.length} radii.` +
          (sep === "," ? " If a number has a thousands comma (12,500), it split in two — write 12500, or paste tab-separated from a spreadsheet." : ""),
      );
    }
    const out: (number | null)[] = [];
    for (let j = 0; j < radii.length; j++) {
      const raw = cells[j] ?? "";
      if (NOT_RATED_TOKENS.has(raw.toLowerCase())) {
        out.push(null);
        continue;
      }
      const v = parseNumericInput(raw);
      if (!Number.isFinite(v)) {
        errors.push(`Row ${lineNo} (boom ${boom} ft), column ${j + 2}: "${raw}" is not a capacity.`);
        out.push(null);
        continue;
      }
      out.push(v);
    }
    boomLengths.push(boom);
    capacities.push(out);
  });

  if (errors.length) return { chart: null, errors };
  const chart: LoadChart = { boomLengths, radii, capacities };
  const validation = validateLoadChart(chart);
  if (validation.errors.length) return { chart: null, errors: validation.errors.map((e) => e.message) };
  return { chart, errors: [] };
}

/** Render a chart back to tab-separated text (round-trips through parseChartText). */
export function chartToText(chart: LoadChart): string {
  const header = ["Boom \\ Radius", ...chart.radii.map(String)].join("\t");
  const body = chart.boomLengths.map((b, i) =>
    [String(b), ...chart.capacities[i].map((c) => (c === null ? "-" : String(c)))].join("\t"),
  );
  return [header, ...body].join("\n");
}
