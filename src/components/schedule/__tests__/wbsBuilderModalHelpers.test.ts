import { describe, expect, it } from "vitest";
import {
  groupWbsTasksByPhase,
  countNonEmptyPhases,
  buildForecast,
  stripPhaseVerb,
  daysSpan,
  formatPretty,
  WBS_EXAMPLES,
  AI_ACCENT,
  monoStyle,
} from "../wbsBuilderModalHelpers";

describe("groupWbsTasksByPhase", () => {
  it("buckets by canonical phase", () => {
    const by = groupWbsTasksByPhase([
      { phase: "Fabrication", task_name: "A — Fabrication" },
      { phase: "Erection", task_name: "A — Erection" },
      { phase: "Unknown", task_name: "skip" },
    ] as any);
    expect(by.Fabrication).toHaveLength(1);
    expect(by.Erection).toHaveLength(1);
    expect(countNonEmptyPhases(by)).toBeGreaterThanOrEqual(2);
  });
});

describe("buildForecast", () => {
  it("rolls tasks up per scope group", () => {
    const f = buildForecast([
      {
        _scopeGroupIndex: 0,
        task_name: "Anchor Bolts - Bldg. 1 — Detailing",
        _scopeLabel: "Anchor Bolts",
        start_date: "2026-01-01",
        end_date: "2026-01-05",
        duration: 5,
        wbs_code: "1.1",
      },
      {
        _scopeGroupIndex: 0,
        task_name: "Anchor Bolts - Bldg. 1 — Fabrication",
        _scopeLabel: "Anchor Bolts",
        start_date: "2026-01-06",
        end_date: "2026-01-20",
        duration: 10,
        wbs_code: "1.2",
      },
    ] as any);
    expect(f.items).toHaveLength(1);
    expect(f.items[0].label).toBe("Anchor Bolts - Bldg. 1");
    expect(f.items[0].start).toBe("2026-01-01");
    expect(f.items[0].end).toBe("2026-01-20");
    expect(f.items[0].durationDays).toBe(15);
    expect(f.projectStart).toBe("2026-01-01");
    expect(f.projectEnd).toBe("2026-01-20");
    expect(f.projectSpan).toBe(daysSpan("2026-01-01", "2026-01-20"));
  });
});

describe("stripPhaseVerb / formatPretty", () => {
  it("strips trailing em-dash phase", () => {
    expect(stripPhaseVerb("Main Steel — Erection")).toBe("Main Steel");
    expect(stripPhaseVerb("plain")).toBe("plain");
  });
  it("formats iso dates", () => {
    expect(formatPretty("2026-03-15")).toMatch(/Mar/);
    expect(formatPretty(null as any)).toBe("—");
  });
});

describe("WBS_EXAMPLES / chrome", () => {
  it("has bid-style example and mono style", () => {
    expect(WBS_EXAMPLES.some((e) => e.label.includes("Bid-style"))).toBe(true);
    expect(monoStyle.fontFamily).toContain("mono");
    expect(AI_ACCENT).toContain("ai-accent");
  });
});

