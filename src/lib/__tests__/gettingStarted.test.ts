import { describe, it, expect } from "vitest";
import { computeGettingStartedSteps, GettingStartedSignals } from "../gettingStarted";

const base: GettingStartedSignals = {
  hasDrawings: false, hasSubmittal: false, hasRfi: false, rfiSkipped: false, hasFabRelease: false,
};
const statusOf = (state: ReturnType<typeof computeGettingStartedSteps>) =>
  Object.fromEntries(state.steps.map((s) => [s.key, s.status]));

describe("computeGettingStartedSteps", () => {
  it("a fresh project: drawings is current, the rest todo", () => {
    const s = computeGettingStartedSteps(base);
    expect(statusOf(s)).toEqual({ drawings: "current", submittals: "todo", rfis: "todo", fab: "todo" });
    expect(s.allComplete).toBe(false);
    expect(s.steps.map((x) => x.key)).toEqual(["drawings", "submittals", "rfis", "fab"]); // order
  });

  it("advances the current marker to the first not-done step", () => {
    expect(statusOf(computeGettingStartedSteps({ ...base, hasDrawings: true })))
      .toEqual({ drawings: "done", submittals: "current", rfis: "todo", fab: "todo" });
    expect(statusOf(computeGettingStartedSteps({ ...base, hasDrawings: true, hasSubmittal: true })))
      .toEqual({ drawings: "done", submittals: "done", rfis: "current", fab: "todo" });
  });

  it("RFI step completes via a real RFI", () => {
    const s = computeGettingStartedSteps({ ...base, hasDrawings: true, hasSubmittal: true, hasRfi: true });
    expect(statusOf(s)).toEqual({ drawings: "done", submittals: "done", rfis: "done", fab: "current" });
  });

  it("RFI step also completes via the skip flag (no RFI needed)", () => {
    const s = computeGettingStartedSteps({ ...base, hasDrawings: true, hasSubmittal: true, rfiSkipped: true });
    expect(statusOf(s).rfis).toBe("done");
    expect(statusOf(s).fab).toBe("current");
  });

  it("a done step stays done even if a later step is still open (non-linear data)", () => {
    // e.g. fab released but RFI step never touched → rfis is the current gap, fab done.
    const s = computeGettingStartedSteps({ ...base, hasDrawings: true, hasSubmittal: true, hasFabRelease: true });
    expect(statusOf(s)).toEqual({ drawings: "done", submittals: "done", rfis: "current", fab: "done" });
    expect(s.allComplete).toBe(false);
  });

  it("all four satisfied → allComplete, no current", () => {
    const s = computeGettingStartedSteps({
      hasDrawings: true, hasSubmittal: true, hasRfi: true, rfiSkipped: false, hasFabRelease: true,
    });
    expect(s.allComplete).toBe(true);
    expect(s.steps.every((x) => x.status === "done")).toBe(true);
  });

  it("tolerates missing/partial input", () => {
    // @ts-expect-error — exercising the defensive Boolean() coercion
    expect(computeGettingStartedSteps({}).allComplete).toBe(false);
  });
});
