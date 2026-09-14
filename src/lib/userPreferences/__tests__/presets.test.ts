import { describe, expect, it } from "vitest";
import { sanitizeUserPreferences } from "../schema";
import { applyPersonalizationPreset, PERSONALIZATION_PRESETS } from "../presets";

describe("personalization presets", () => {
  it("provides PM, field, fabrication, and executive starting points", () => {
    expect(Object.keys(PERSONALIZATION_PRESETS)).toEqual([
      "project_manager",
      "field",
      "fabrication",
      "executive",
    ]);
    expect(PERSONALIZATION_PRESETS.field.default_landing).toBe("FieldToday");
    expect(PERSONALIZATION_PRESETS.fabrication.pinned_modules).toContain("PieceRegister");
    expect(PERSONALIZATION_PRESETS.executive.pinned_modules).toContain("ReportsHub");
  });

  it("applies a preset without overwriting unrelated notification preferences", () => {
    const current = sanitizeUserPreferences({
      notify_rfi_overdue: false,
      notify_delivery_late: false,
      theme: "light",
    });

    const result = applyPersonalizationPreset(current, "project_manager");

    expect(result.workspace_preset).toBe("project_manager");
    expect(result.default_landing).toBe("Dashboard");
    expect(result.notify_rfi_overdue).toBe(false);
    expect(result.notify_delivery_late).toBe(false);
    expect(result.theme).toBe("light");
  });
});
