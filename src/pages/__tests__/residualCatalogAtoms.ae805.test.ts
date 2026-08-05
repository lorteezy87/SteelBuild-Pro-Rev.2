import { describe, expect, it } from "vitest";
import { SENT_STATUSES, VERDICT_STATUSES } from "@/lib/submittalLinkGlue";
import {
  TERMINAL,
  DETAILER_CLASS,
  REVIEWER_CLASS,
} from "@/lib/submittalReviewEngine";
import { GANTT_PDF_PALETTE } from "@/lib/exportGanttPdf";
import { WEATHER_RISK_THRESHOLDS } from "@/lib/weatherRisk";
import { SEVERITIES } from "@/lib/revisionPackageReport";
import { VALID_PHASES, VALID_ABBREVS } from "@/lib/wbsBuilder";

describe("residual catalog atoms batch AE", () => {
  it("submittal link status sets", () => {
    expect(SENT_STATUSES.has("Submitted")).toBe(true);
    expect(VERDICT_STATUSES.has("Approved as Noted")).toBe(true);
    expect(VERDICT_STATUSES.has("Draft")).toBe(false);
  });

  it("submittal review class/terminal catalogs", () => {
    expect(TERMINAL.has("Void")).toBe(true);
    expect(DETAILER_CLASS.has("Detailer")).toBe(true);
    expect(REVIEWER_CLASS.has("EOR")).toBe(true);
    expect(REVIEWER_CLASS.has("Detailer")).toBe(false);
  });

  it("gantt PDF palette and weather risk thresholds", () => {
    expect(GANTT_PDF_PALETTE.accent).toEqual([200, 155, 32]);
    expect(GANTT_PDF_PALETTE.text[0]).toBe(20);
    expect(WEATHER_RISK_THRESHOLDS.heavyRainMm).toBe(12);
    expect(WEATHER_RISK_THRESHOLDS.highGustKph).toBe(55);
    expect(WEATHER_RISK_THRESHOLDS.heatCeilingC).toBe(38);
  });

  it("revision severities and WBS phase validation sets", () => {
    expect(SEVERITIES[0]).toBe("critical");
    expect(SEVERITIES).toContain("info");
    expect(VALID_PHASES.size).toBeGreaterThan(0);
    expect(VALID_ABBREVS.size).toBeGreaterThan(0);
  });
});
