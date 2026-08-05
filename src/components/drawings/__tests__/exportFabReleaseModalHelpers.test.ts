import { describe, expect, it } from "vitest";
import {
  mono,
  labelStyle,
  btnBase,
  KIND_CONFIG,
  GATE_REASON_ICON,
} from "../exportFabReleaseModalHelpers";

describe("exportFabReleaseModalHelpers", () => {
  it("styles", () => {
    expect(mono.fontFamily).toContain("font-mono");
    expect(labelStyle.fontSize).toBe(10);
    expect(btnBase.padding).toBe("8px 16px");
  });
  it("kind config keys", () => {
    expect(KIND_CONFIG.fab_release.eyebrow).toBe("FABRICATION RELEASE");
    expect(KIND_CONFIG.claims.filterLabel).toBe("All (chronological)");
  });
  it("gate reason icons", () => {
    expect(GATE_REASON_ICON.open_rfis).toBe("❓");
    expect(GATE_REASON_ICON.missing_signoffs).toBe("✍");
  });
});
