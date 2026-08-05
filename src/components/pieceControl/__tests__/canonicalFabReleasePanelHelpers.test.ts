import { describe, expect, it } from "vitest";
import {
  CHECK_LABELS,
  presentBlocker,
  primaryBtnStyle,
  panelStyle,
} from "../canonicalFabReleasePanelHelpers";

describe("canonicalFabReleasePanelHelpers", () => {
  it("check labels and blocker copy", () => {
    expect(CHECK_LABELS.map((c) => c.key)).toEqual(["scope", "drawings", "material", "holds"]);
    expect(
      presentBlocker(
        "No active, actionable canonical leaf pieces are assigned to this work package.",
      ),
    ).toMatch(/active pieces/i);
    expect(presentBlocker("other")).toBe("other");
  });
  it("styles", () => {
    expect(panelStyle.borderRadius).toBe(16);
    expect(primaryBtnStyle("good").background).toContain("success");
  });
});
