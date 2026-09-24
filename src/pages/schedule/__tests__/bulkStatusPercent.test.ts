import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reconcileStatusPercent } from "@/lib/schedule/taskStatus";

/**
 * Wiring cover for the bulk toolbar's status/percent write.
 *
 * `schedule_status_pct_consistency` is evaluated against the WHOLE resulting
 * row, so an UPDATE that sends `status` alone is validated against the percent
 * already stored. The toolbar used to build its percent inline:
 *
 *   percent_complete: status === "Complete" ? 100
 *                   : status === "Not Started" ? 0
 *                   : undefined
 *
 * `cleanRecord` drops undefined keys, so the last branch sent `status` alone.
 * For Delayed and On Hold that is harmless — the constraint does not pin those.
 * For **In Progress** it is the reopen case and it failed: the stored percent
 * on a finished task is 100, and In Progress requires < 100.
 *
 * Worth being exact, because the repo's own prose has had this backwards. The
 * toolbar was not wholly wrong and not wholly right: it handled Complete and
 * Not Started correctly and broke only on In Progress. The behavioural rules
 * live in src/lib/schedule/__tests__/taskStatus.test.ts; this file pins that
 * the toolbar defers to them instead of keeping a second opinion.
 */

const MUT_SRC = readFileSync(new URL("../useScheduleMutations.ts", import.meta.url), "utf8");

/** The bulk mutation body, so a match elsewhere in the file cannot pass for it. */
const BULK_BODY = (() => {
  const start = MUT_SRC.indexOf("const bulkUpdateMut");
  expect(start, "bulkUpdateMut not found — this guard would pass vacuously").toBeGreaterThan(-1);
  const end = MUT_SRC.indexOf("onSuccess", start);
  return MUT_SRC.slice(start, end);
})();

describe("the bulk toolbar defers to the one reconciler", () => {
  it("calls reconcileStatusPercent with the task's stored percent", () => {
    // The stored value is the whole point: without it the reconciler cannot
    // tell a reopen (stored 100) from an ordinary In Progress save.
    expect(BULK_BODY).toMatch(/reconcileStatusPercent\(\s*status,\s*task\?\.percent_complete\s*\)/);
  });

  it("no longer hand-writes the percent inline", () => {
    // The exact shape that shipped. Pinning it means a revert fails here
    // rather than silently reintroducing the failed reopen.
    expect(BULK_BODY).not.toMatch(/status === "Complete" \? 100/);
    expect(BULK_BODY).not.toMatch(/status === "Not Started" \? 0/);
  });

  it("omits the column rather than sending an explicit undefined", () => {
    // reconcileStatusPercent returns undefined for "leave it alone". Spreading
    // {} keeps that intent legible instead of relying on cleanRecord to strip
    // an undefined value on the way past.
    expect(BULK_BODY).toMatch(/reconciled === undefined \? \{\} : \{ percent_complete: reconciled \}/);
  });

  it("imports the reconciler it uses", () => {
    expect(MUT_SRC).toMatch(
      /import \{ reconcileStatusPercent, withReconciledPercent \} from "@\/lib\/schedule\/taskStatus";/,
    );
  });
});

describe("what the reconciler answers for each bulk transition", () => {
  // Reading the table the toolbar now relies on. A stored 100 is a finished
  // task — the row every one of these transitions starts from when a PM
  // multi-selects completed work and moves it.
  it("→ Complete pins 100 when the stored percent disagrees", () => {
    expect(reconcileStatusPercent("Complete", 40)).toBe(100);
    expect(reconcileStatusPercent("Complete", 100)).toBeUndefined();
  });

  it("→ Not Started pins 0 when the stored percent disagrees", () => {
    expect(reconcileStatusPercent("Not Started", 100)).toBe(0);
    expect(reconcileStatusPercent("Not Started", 0)).toBeUndefined();
  });

  it("→ In Progress from a finished task answers null, which is the fix", () => {
    // This is the transition that used to fail. Sending status alone left the
    // stored 100 in the row and In Progress requires < 100.
    expect(reconcileStatusPercent("In Progress", 100)).toBeNull();
    // An already-legal in-progress number is the user's and is left alone.
    expect(reconcileStatusPercent("In Progress", 40)).toBeUndefined();
    // Nothing stored is unknown, not zero.
    expect(reconcileStatusPercent("In Progress", null)).toBeNull();
  });

  it("→ Delayed / On Hold keep whatever progress the task had", () => {
    // Unconstrained, and holding a task is precisely when you keep its
    // progress. Omitting the column here was always correct.
    for (const status of ["Delayed", "On Hold"]) {
      expect(reconcileStatusPercent(status, 100)).toBeUndefined();
      expect(reconcileStatusPercent(status, 60)).toBeUndefined();
      expect(reconcileStatusPercent(status, null)).toBeUndefined();
    }
  });
});
