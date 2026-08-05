import { describe, expect, it } from "vitest";
import {
  TRANSMITTAL_PDF_COLORS,
  TRANSMITTAL_STATUS_COLOR,
} from "@/lib/generateTransmittalHelpers";
import { DEFAULT_HEALTH_THRESHOLDS } from "@/services/portfolioHealthScoring";
import {
  DRAWING_HEALTH_WEIGHTS,
  DRAWING_HEALTH_BANDS,
} from "@/services/drawingHealthScore";
import { PHASE_RANK } from "@/pages/deliveries/analytics";
import { drawerTd, drawerTdRight } from "@/pages/financials/drawerHelpers";

describe("residual catalog atoms batch T", () => {
  it("transmittal PDF palettes", () => {
    expect(TRANSMITTAL_PDF_COLORS.accent).toEqual([0, 175, 215]);
    expect(TRANSMITTAL_STATUS_COLOR.Approved).toEqual([22, 163, 74]);
    expect(TRANSMITTAL_STATUS_COLOR.Rejected[0]).toBe(220);
  });

  it("health weights thresholds and delivery phase rank", () => {
    expect(DEFAULT_HEALTH_THRESHOLDS.onTrack).toBe(76);
    expect(DEFAULT_HEALTH_THRESHOLDS.watch).toBe(52);
    expect(DRAWING_HEALTH_WEIGHTS.openRfis).toBe(20);
    expect(DRAWING_HEALTH_BANDS.critical.color).toBe("#F85149");
    expect(PHASE_RANK.Erection).toBe(3);
    expect(PHASE_RANK.Detailing).toBe(0);
  });

  it("financial drawer cell chrome", () => {
    expect(drawerTd.fontSize).toBe(11);
    expect(drawerTdRight.textAlign).toBe("right");
    expect(drawerTdRight.fontFamily).toBe("var(--font-mono)");
  });
});
