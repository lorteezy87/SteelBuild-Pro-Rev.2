/**
 * detailingKpis: the Control Board's KPI strip and the other tabs' status
 * line (owner decision 2, 2026-09-11). The strip was lifted from the shell
 * unchanged, so its labels, pending rule and overdue sublabels are pinned
 * byte for byte.
 */
import { describe, expect, it } from "vitest";
import { KPI_PENDING, buildDetailingKpiCells, buildStatusLine, fleetGrade, totalOverdue } from "../detailingKpis";
import type { DetailingKpis } from "../detailingKpis";

const KPIS: DetailingKpis = {
  totalSets: 4, totalSheets: 20, released: 1, inReview: 2,
  submittalsTotal: 3, submittalsPending: 1, needsAction: 2,
  overdue: 3, atRisk: 1, overdueDrawingSets: 3, overdueUnlinkedSubmittals: 2,
  fabReadyNumerator: 1, fabReadyDenominator: 4, fabReadyPercent: 25,
  openItems: 6, fleetAverageScore: 71,
};

const ZERO: DetailingKpis = {
  ...KPIS,
  released: 0, inReview: 0, needsAction: 0, overdue: 0, atRisk: 0,
  overdueDrawingSets: 0, overdueUnlinkedSubmittals: 0,
};

const byLabel = (cells: ReturnType<typeof buildDetailingKpiCells>, label: string) => {
  const found = cells.find((c) => c.label === label);
  if (!found) throw new Error(`no "${label}" cell`);
  return found;
};

describe("buildDetailingKpiCells", () => {
  it("keeps the cells, in order, with the scoped 'Submittals Needing Action' label", () => {
    expect(buildDetailingKpiCells(KPIS, false).map((c) => c.label)).toEqual([
      "Drawing Sets", "Released", "In Review", "Submittals", "Submittals Needing Action", "Overdue", "At Risk",
      // Fleet Health closes the strip: the rollup was computed and passed in
      // from the first version of this shell and shown nowhere.
      "Fleet Health",
    ]);
  });

  it("shows the real numbers, sublabels and deterministic tones once loaded", () => {
    const cells = buildDetailingKpiCells(KPIS, false);
    expect(cells.map((c) => [c.value, c.sublabel, c.tone])).toEqual([
      [4, "20 active sheets", "neutral"],
      [1, "sets to fab", "good"],
      [2, undefined, "info"],
      [3, "1 pending", "neutral"],
      [2, "rejected / returned", "warn"],
      [5, "3 sets · 2 unlinked subs", "danger"],
      [1, "schedule risk", "warn"],
      [71, "avg score · C", "warn"],
    ]);
  });

  it("drops the alert tones to neutral when there's nothing to flag", () => {
    const tones = buildDetailingKpiCells(ZERO, false).map((c) => c.tone);
    // ZERO keeps KPIS' fleetAverageScore of 71 — a real, scored fleet in the
    // C band, which is a warn whatever the counts say.
    expect(tones).toEqual(["neutral", "good", "neutral", "neutral", "neutral", "neutral", "neutral", "warn"]);
  });

  it("shows an em dash and a neutral tone for every value while pending, never a 0", () => {
    const cells = buildDetailingKpiCells(KPIS, true);
    expect(cells.map((c) => c.value)).toEqual(Array(8).fill(KPI_PENDING));
    expect(cells.every((c) => c.tone === "neutral")).toBe(true);
    expect(byLabel(cells, "Drawing Sets").sublabel).toBe("loading…");
    expect(byLabel(cells, "Submittals").sublabel).toBe("loading…");
    expect(byLabel(cells, "Overdue").sublabel).toBe("loading…");
  });

  it.each([
    [3, 2, 5, "3 sets · 2 unlinked subs"],
    [0, 2, 2, "2 unlinked subs"],
    [3, 0, 3, "3 drawing sets"],
    [0, 0, 0, "sets + unlinked submittals"],
  ])("Overdue counts both kinds (%i sets, %i unlinked) with a byte-identical sublabel", (sets, unlinked, value, sublabel) => {
    const kpis = { ...KPIS, overdueDrawingSets: sets, overdueUnlinkedSubmittals: unlinked };
    const overdue = byLabel(buildDetailingKpiCells(kpis, false), "Overdue");
    expect(overdue.value).toBe(value);
    expect(overdue.sublabel).toBe(sublabel);
    expect(totalOverdue(kpis)).toBe(value);
  });
});

describe("buildStatusLine", () => {
  it("summarises sets, open items, both overdue kinds, at-risk and Fab Ready on one line", () => {
    expect(buildStatusLine(KPIS, false)).toBe("4 sets · 6 open · 5 overdue · 1 at risk · Fab Ready 1/4");
  });

  it("uses the singular for one set, and a dash for Fab Ready with no sheet to count", () => {
    expect(buildStatusLine({ ...ZERO, totalSets: 1, openItems: 0, fabReadyNumerator: 0, fabReadyDenominator: 0 }, false))
      .toBe("1 set · 0 open · 0 overdue · 0 at risk · Fab Ready —");
  });

  it("says '—' for every number while pending, never 0", () => {
    expect(buildStatusLine(ZERO, true)).toBe("— sets · — open · — overdue · — at risk · Fab Ready —");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Health — the rollup that was computed and never rendered.
// ─────────────────────────────────────────────────────────────────────────────

describe("Fleet Health cell", () => {
  const cell = (fleetAverageScore: number | null, pending = false) =>
    buildDetailingKpiCells({ ...KPIS, fleetAverageScore }, pending)
      .find((c) => c.label === "Fleet Health")!;

  it("is on the strip at all", () => {
    expect(cell(88)).toBeDefined();
  });

  it("shows the average score with its grade", () => {
    expect(cell(88).value).toBe(88);
    expect(cell(88).sublabel).toBe("avg score · B");
  });

  it("reads em dash, not 100, when no set has been scored", () => {
    // summarizeFleetHealth returns averageScore 100 for an empty list; the hub
    // maps that to null. A brand-new project has no health, not perfect health.
    expect(cell(null).value).toBe(KPI_PENDING);
    expect(cell(null).sublabel).toBe("no scored sets");
    expect(cell(null).tone).toBe("neutral");
  });

  it("reads em dash while the queries are in flight", () => {
    expect(cell(88, true).value).toBe(KPI_PENDING);
    expect(cell(88, true).tone).toBe("neutral");
  });

  it("tones on the same thresholds as the grade", () => {
    expect(cell(95).tone).toBe("good");
    expect(cell(80).tone).toBe("good");
    expect(cell(79).tone).toBe("warn");
    expect(cell(60).tone).toBe("warn");
    expect(cell(59).tone).toBe("danger");
  });
});

describe("fleetGrade", () => {
  it("matches gradeFor in drawingHealthScore — one scale, not two", () => {
    expect(fleetGrade(90)).toBe("A");
    expect(fleetGrade(89)).toBe("B");
    expect(fleetGrade(80)).toBe("B");
    expect(fleetGrade(79)).toBe("C");
    expect(fleetGrade(70)).toBe("C");
    expect(fleetGrade(69)).toBe("D");
    expect(fleetGrade(60)).toBe("D");
    expect(fleetGrade(59)).toBe("F");
  });
});
