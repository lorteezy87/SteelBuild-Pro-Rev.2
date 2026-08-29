import { describe, expect, it } from "vitest";
import { computeInstallReadiness } from "../installReadiness";

describe("computeInstallReadiness", () => {
  it("gates an open fab task", () => {
    const r = computeInstallReadiness({ phase: "Fabrication", status: "In Progress" });
    expect(r.status).toBe("gated");
    expect(r.reasons.some((x) => /fabricat/i.test(x))).toBe(true);
  });

  it("blocks on critical gate", () => {
    const r = computeInstallReadiness({
      phase: "Erection",
      status: "In Progress",
      _gate: {
        state: "blocked",
        canSchedule: false,
        blockers: [{ rfiNumber: "12", title: "Anchor bolts" }],
        warnings: [],
      },
    });
    expect(r.status).toBe("blocked");
    expect(r.reasons[0]).toMatch(/RFI 12/);
  });

  it("marks complete erection as ready when no gates", () => {
    const r = computeInstallReadiness({ phase: "Erection", status: "Complete" });
    expect(r.status).toBe("ready");
  });
});
