import { describe, expect, it } from "vitest";
import { PRIORITY_ORDER } from "@/components/schedule/scheduleTaskListHelpers";
import { CLOSED_STATUSES as RIVET_CLOSED } from "@/components/schedule/rivetBriefHelpers";
import {
  HEADER_SYNONYMS,
  CANONICAL_FIELDS,
} from "@/components/submittals/submittalBulkAddHelpers";
import {
  ACTIVE_PHASE_STATUSES_EXCLUDED,
  RESOURCE_SIDEBAR_TYPES,
} from "@/pages/resourceScheduling/resourceSchedulingHelpers";
import { CLOSED_FOR_OPEN } from "@/pages/rfis/rfiInsightsHelpers";
import { TERMINAL as PROC_TERMINAL } from "@/pages/procurement/procurementPageHelpers";
import { NON_OVERDUE_STATUSES } from "@/pages/submittals/submittalsPageHelpers";
import { COMMENT_DISPOSITION_INPUT_STYLE } from "@/components/submittals/commentDispositionChecklistHelpers";
import { COST_CHART_EMPTY_STYLE } from "@/pages/costHub/costControlCenterHelpers";
import {
  DRILL_TH_STYLE,
  DRILL_TD_STYLE,
} from "@/pages/drawingSubmittalHub/triageBoardHelpers";

function sizeish(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && "size" in (v as any)) return Number((v as any).size) || 0;
  if (Array.isArray(v)) return v.length;
  if (typeof v === "object") return Object.keys(v as object).length;
  return 0;
}

describe("residual catalog atoms batch AM", () => {
  it("exports remaining helper catalogs", () => {
    expect(sizeish(PRIORITY_ORDER)).toBeGreaterThan(0);
    expect(sizeish(RIVET_CLOSED)).toBeGreaterThan(0);
    expect(typeof HEADER_SYNONYMS).toBe("object");
    expect(sizeish(CANONICAL_FIELDS)).toBeGreaterThan(0);
    expect(sizeish(ACTIVE_PHASE_STATUSES_EXCLUDED)).toBeGreaterThan(0);
    expect(sizeish(RESOURCE_SIDEBAR_TYPES)).toBeGreaterThan(0);
    expect(sizeish(CLOSED_FOR_OPEN)).toBeGreaterThan(0);
    expect(sizeish(PROC_TERMINAL)).toBeGreaterThan(0);
    expect(sizeish(NON_OVERDUE_STATUSES)).toBeGreaterThan(0);
  });

  it("comment disposition, cost chart, triage drill chrome", () => {
    expect(COMMENT_DISPOSITION_INPUT_STYLE.fontFamily).toBe("var(--font-mono)");
    expect(COMMENT_DISPOSITION_INPUT_STYLE.fontSize).toBe(11);
    expect(COST_CHART_EMPTY_STYLE.textAlign).toBe("center");
    expect(COST_CHART_EMPTY_STYLE.padding).toBe(32);
    expect(DRILL_TH_STYLE.fontSize).toBe(9);
    expect(DRILL_TH_STYLE.textTransform).toBe("uppercase");
    expect(DRILL_TD_STYLE.padding).toBe("6px 12px");
  });
});
