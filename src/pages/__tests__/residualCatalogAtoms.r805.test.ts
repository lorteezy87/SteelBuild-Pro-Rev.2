import { describe, expect, it } from "vitest";
import {
  RESPONSE_MATRIX_TH_STYLE,
  RESPONSE_MATRIX_TD_STYLE,
  RESPONSE_MATRIX_EMPTY_STYLE,
  RESPONSE_COLORS,
} from "@/components/submittals/responseMatrixHelpers";
import { USER_PREF_DEFAULTS, DASHBOARD_KPI_IDS } from "@/hooks/useUserPrefs";

describe("residual catalog atoms batch R", () => {
  it("response matrix chrome", () => {
    expect(RESPONSE_MATRIX_TH_STYLE.fontSize).toBe(8.5);
    expect(RESPONSE_MATRIX_TD_STYLE.verticalAlign).toBe("middle");
    expect(RESPONSE_MATRIX_EMPTY_STYLE.fontStyle).toBe("italic");
    expect(RESPONSE_COLORS.Rejected.color).toBe("var(--status-error)");
  });

  it("user pref defaults", () => {
    expect(USER_PREF_DEFAULTS.week_start).toBe("sunday");
    expect(USER_PREF_DEFAULTS.auto_refresh_secs).toBe(0);
    expect(USER_PREF_DEFAULTS.dashboard_density).toBe("normal");
    expect(USER_PREF_DEFAULTS.visible_kpis).toEqual(DASHBOARD_KPI_IDS);
    expect(DASHBOARD_KPI_IDS).toContain("open_rfis");
  });
});
