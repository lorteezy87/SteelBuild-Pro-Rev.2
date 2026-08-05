import { describe, expect, it } from "vitest";
import {
  deriveZones,
  zoneHealth,
  summarizeZoneHealth,
  PHASE_COLOR,
  STATUS_COLOR,
} from "../siteMapHelpers";

describe("deriveZones", () => {
  it("extracts level/bay patterns", () => {
    const zones = deriveZones([
      { name: "Level 2 Framing", status: "In Progress", percent_complete: 40, linked_drawing_ids: "a", wp_number: "WP-1" },
      { name: "Bay 4 Columns", status: "Complete", percent_complete: 100, linked_drawing_ids: "b", wp_number: "WP-2" },
    ]);
    expect(zones.some((z) => /level 2/i.test(z.label))).toBe(true);
    expect(zones.some((z) => /bay 4/i.test(z.label))).toBe(true);
  });
});

describe("zoneHealth", () => {
  it("marks blocked when on hold", () => {
    const z = { label: "X", wps: [{ status: "On Hold", linked_drawing_ids: "1", wp_number: "WP-9", percent_complete: 0 }] };
    expect(zoneHealth(z).label).toBe("Blocked");
  });

  it("marks warning when no drawings", () => {
    const z = { label: "X", wps: [{ status: "Not Started", linked_drawing_ids: "", wp_number: "WP-9", percent_complete: 0 }] };
    expect(zoneHealth(z).label).toBe("Warning");
  });
});

describe("summarizeZoneHealth", () => {
  it("counts active/blocked/complete", () => {
    const zones = deriveZones([
      { name: "Level 1 A", status: "On Hold", linked_drawing_ids: "x", wp_number: "1" },
      { name: "Level 2 B", status: "Complete", percent_complete: 100, linked_drawing_ids: "y", wp_number: "2" },
    ]);
    const s = summarizeZoneHealth(zones);
    expect(s.blockedZones).toBeGreaterThanOrEqual(1);
    expect(s.completeZones).toBeGreaterThanOrEqual(1);
  });
});

describe("site map chrome colors", () => {
  it("phase and status colors from gantt theme", () => {
    expect(PHASE_COLOR.Detailing).toBeTruthy();
    expect(STATUS_COLOR.Complete).toBeTruthy();
  });
});
