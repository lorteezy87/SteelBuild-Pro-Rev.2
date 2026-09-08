import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { computeEffectiveDates } from "@/services/scheduleCascade";
import { computeCycleTaskIdsKey } from "../scheduleGanttDerive";

/**
 * Regression cover for audit §1.1 — "the Gantt's phase filter silently changes
 * the dates it shows".
 *
 * ScheduleGantt used to run `computeEffectiveDates(allTasks)` where `allTasks`
 * was the PHASE-FILTERED row set. scheduleCascade's resolve() skips any link
 * whose predecessor is missing from the array it is handed, so filtering to one
 * phase dropped every cross-phase predecessor and reverted its successors to
 * un-cascaded stored dates — with no indicator. In production 67% of
 * predecessor links cross a phase boundary.
 *
 * There is no DOM test for ScheduleGantt anywhere in the repo, so this file
 * covers the two things that actually make the fix work: the cascade's
 * scope-sensitivity (why the prop must be full-scope) and the wiring that
 * delivers it.
 */

/**
 * Strip comments so source assertions test CODE, not prose. ScheduleGantt
 * deliberately names the removed call in a comment explaining why it must not
 * come back; a raw substring check would read that as the regression itself.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const GANTT_SRC = readFileSync(new URL("../ScheduleGantt.jsx", import.meta.url), "utf8");
const GANTT_CODE = stripComments(GANTT_SRC);
const BODY_SRC = readFileSync(new URL("../../../pages/schedule/ScheduleBody.tsx", import.meta.url), "utf8");

// A minimal but realistic steel job: approval gates fabrication across a phase
// boundary. This is the shape the bug hit.
const PROJECT = [
  {
    id: "det-1",
    task_name: "Approve shop drawings",
    phase: "Detailing",
    start_date: "2026-03-02",
    end_date: "2026-03-06",
  },
  {
    id: "fab-1",
    task_name: "Fabricate beams",
    phase: "Fabrication",
    start_date: "2026-03-02",
    end_date: "2026-03-09",
    dependencies: JSON.stringify([{ id: "det-1", type: "FS", lag_days: 1 }]),
  },
];

describe("cascade scope — why the Gantt must not recompute from filtered rows", () => {
  it("full-scope cascade holds the successor behind its cross-phase predecessor", () => {
    const eff = computeEffectiveDates(PROJECT);
    expect(eff["fab-1"].start).toBe("2026-03-07"); // det-1 ends 03-06, FS + 1
    expect(eff["fab-1"].shifted).toBe(true);
  });

  it("cascading over a phase-filtered subset silently loses the link", () => {
    // This is the OLD behavior, kept as an executable statement of the bug: the
    // predecessor is not in the array, so the link is skipped and the task
    // reports its raw stored date as if nothing constrained it.
    const fabOnly = PROJECT.filter((t) => t.phase === "Fabrication");
    const eff = computeEffectiveDates(fabOnly);
    expect(eff["fab-1"].start).toBe("2026-03-02");
    expect(eff["fab-1"].shifted).toBe(false);
  });

  it("the two disagree — which is exactly why scope is not an implementation detail", () => {
    const full = computeEffectiveDates(PROJECT)["fab-1"];
    const filtered = computeEffectiveDates(PROJECT.filter((t) => t.phase === "Fabrication"))["fab-1"];
    expect(full.start).not.toBe(filtered.start);
  });
});

describe("computeCycleTaskIdsKey", () => {
  const eff = {
    a: { cycle: true },
    b: { cycle: true },
    c: { cycle: false },
  };

  it("reports only cycle members that are actually rendered", () => {
    // The map is whole-project; the rows are filtered. Warning about a loop the
    // user cannot see (and cannot reach under a filter) is noise.
    expect(computeCycleTaskIdsKey(eff, [{ id: "a" }, { id: "c" }])).toBe("a");
  });

  it("still warns when a cycle only PARTLY intersects the visible rows", () => {
    // The visible member is the one silently sitting on stored dates.
    expect(computeCycleTaskIdsKey(eff, [{ id: "b" }])).toBe("b");
  });

  it("is order-independent and de-duplicated, so it is safe as a memo dep", () => {
    expect(computeCycleTaskIdsKey(eff, [{ id: "b" }, { id: "a" }, { id: "a" }])).toBe("a|b");
    expect(computeCycleTaskIdsKey(eff, [{ id: "a" }, { id: "b" }])).toBe("a|b");
  });

  it("returns empty for no cycles, no rows, or a missing map", () => {
    expect(computeCycleTaskIdsKey(eff, [{ id: "c" }])).toBe("");
    expect(computeCycleTaskIdsKey(eff, [])).toBe("");
    expect(computeCycleTaskIdsKey(null, [{ id: "a" }])).toBe("");
    expect(computeCycleTaskIdsKey(eff, null)).toBe("");
  });

  it("ignores rows with no id rather than throwing", () => {
    expect(computeCycleTaskIdsKey(eff, [{}, { id: "a" }] as any)).toBe("a");
  });
});

describe("wiring — the Gantt consumes the map, it does not build one", () => {
  it("ScheduleGantt never recomputes the cascade", () => {
    // Narrow on purpose: the regression is a RECOMPUTE, not importing the
    // module. Banning the whole module would block legitimate pure helpers.
    expect(GANTT_CODE).not.toContain("computeEffectiveDates");
  });

  it("that guard ignores comments but still catches a real call", () => {
    // Proves stripComments did not neuter the assertion above.
    expect(stripComments("// computeEffectiveDates(allTasks)\nconst a = 1;"))
      .not.toContain("computeEffectiveDates");
    expect(stripComments("const eff = computeEffectiveDates(allTasks);"))
      .toContain("computeEffectiveDates");
  });

  it("ScheduleGantt accepts effectiveDates as a prop", () => {
    expect(GANTT_SRC).toMatch(/export default function ScheduleGantt\([^)]*effectiveDates\s*=/);
  });

  it("ScheduleBody passes the full-scope map to the Gantt specifically", () => {
    // Anchored to the <ScheduleGantt> element. An unanchored search would pass
    // on unmodified main — TaskDetailDrawer already receives the same prop.
    expect(BODY_SRC).toMatch(/<ScheduleGantt[\s\S]{0,600}?effectiveDates=\{\s*effectiveDatesMap\s*\}/);
  });

  it("the anchored guard would fail if only the drawer had the prop", () => {
    // Proves the assertion above is not vacuous.
    const drawerOnly = BODY_SRC.replace(
      /(<ScheduleGantt[\s\S]{0,600}?)effectiveDates=\{effectiveDatesMap\}/,
      "$1",
    );
    expect(drawerOnly).not.toMatch(
      /<ScheduleGantt[\s\S]{0,600}?effectiveDates=\{\s*effectiveDatesMap\s*\}/,
    );
  });
});
