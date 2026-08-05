import { describe, expect, it } from "vitest";
import {
  SEVERITY_COLORS,
  SAFETY_STATUS_COLORS,
  SAFETY_STATUS_OPTIONS,
} from "../safety/safetyIncidentListHelpers";
import {
  CR_STATUS_COLORS,
  CR_PRIORITY_COLORS,
} from "../changerequest/changeRequestListHelpers";
import {
  SET_APPROVAL_STATUS_OPTS,
  SET_APPROVAL_STATUS_LABELS,
} from "../drawings/setApprovalModalHelpers";
import { BULK_EDIT_INITIAL } from "../drawings/bulkEditModalStyleHelpers";
import { SETUP_ADMIN_ITEMS } from "../settings/setupAdminTabHelpers";
import { USER_TIMEZONES, USER_SETTINGS_STYLES } from "../settings/userSettingsTabHelpers";
import {
  QR_CODE_BACKGROUND,
  MFA_LBL,
  mfaBtnPrimary,
} from "../settings/mfaSectionHelpers";
import { KEYBOARD_SHORTCUTS } from "../settings/shortcutsTabHelpers";
import { commentThreadQueryKey } from "../collaboration/commentThreadHelpers";
import { signoffQueryKey } from "../drawings/signoffStampPanelHelpers";
import { SECTION_STAT_COLOR } from "../../pages/dashboard/sections/sectionCardHelpers";
import {
  MODEL3D_COLOR_MODES,
  MODEL3D_TYPE_LABELS,
} from "../viewer3d/model3dTabHelpers";
import { PIE_COLORS, AXIS_TICK } from "../../pages/budgetHours/bhChartRowHelpers";

describe("settings/safety/list pure atoms", () => {
  it("safety tones", () => {
    expect(SEVERITY_COLORS.Critical).toContain("error");
    expect(SAFETY_STATUS_COLORS.Open).toContain("error");
    expect(SAFETY_STATUS_OPTIONS).toContain("Closed");
  });

  it("change request tones", () => {
    expect(CR_STATUS_COLORS.Approved).toContain("success");
    expect(CR_PRIORITY_COLORS.High).toContain("warning");
  });

  it("drawing bulk/approval", () => {
    expect(SET_APPROVAL_STATUS_OPTS).toEqual(["approved", "rejected", "superseded"]);
    expect(SET_APPROVAL_STATUS_LABELS.approved).toBe("Approved");
    expect(BULK_EDIT_INITIAL.stage).toBe("");
    expect(BULK_EDIT_INITIAL.priority_flag).toBe(false);
  });

  it("settings catalogs", () => {
    expect(SETUP_ADMIN_ITEMS).toHaveLength(6);
    expect(USER_TIMEZONES).toContain("America/Phoenix");
    expect(USER_SETTINGS_STYLES.input.borderRadius).toBe(8);
    expect(QR_CODE_BACKGROUND).toBe("#fff");
    expect(MFA_LBL.fontSize).toBe(8);
    expect(mfaBtnPrimary(true).opacity).toBe(0.6);
    expect(KEYBOARD_SHORTCUTS[0].group).toBe("Global");
    expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThanOrEqual(5);
  });

  it("query keys and chart tokens", () => {
    expect(commentThreadQueryKey("rfi", "1")).toEqual(["comments", "rfi", "1"]);
    expect(signoffQueryKey("d1", "r1")).toEqual(["signoffs", "d1", "r1"]);
    expect(SECTION_STAT_COLOR.success).toContain("success");
    expect(MODEL3D_COLOR_MODES.map((m) => m.key)).toContain("fab");
    expect(MODEL3D_TYPE_LABELS[0][0]).toBe("beam");
    expect(PIE_COLORS.Shop).toContain("accent");
    expect(AXIS_TICK.fontSize).toBe(9);
  });
});
