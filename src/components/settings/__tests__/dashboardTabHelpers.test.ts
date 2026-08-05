import { describe, expect, it } from "vitest";
import {
  AVAILABLE_KPIS,
  KPI_IDS,
  sanitizeKpis,
  AVAILABLE_MODULES,
  LANDING_PAGES,
} from "../dashboardTabHelpers";

describe("dashboardTabHelpers", () => {
  it("catalogs", () => {
    expect(AVAILABLE_KPIS.some((k) => k.id === "open_rfis")).toBe(true);
    expect(KPI_IDS).toContain("open_rfis");
    expect(AVAILABLE_MODULES.some((m) => m.id === "RFIs")).toBe(true);
    expect(LANDING_PAGES.some((p) => p.id === "Dashboard")).toBe(true);
  });
  it("sanitizeKpis drops unknown and falls back", () => {
    expect(sanitizeKpis(["open_rfis", "nope"])).toEqual(["open_rfis"]);
    expect(sanitizeKpis([])).toEqual([...KPI_IDS]);
    expect(sanitizeKpis(null)).toEqual([...KPI_IDS]);
  });
});
