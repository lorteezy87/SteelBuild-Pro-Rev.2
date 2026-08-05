import { describe, expect, it } from "vitest";
import {
  FOLDER_PICKER_OVERLAY_STYLE,
  FOLDER_PICKER_DIALOG_STYLE,
  folderPickerBtnStyle,
} from "@/components/dms/folderPickerHelpers";
import { KPI_ACCENT_MAP, resolveKpiAccent } from "@/components/shared/kpiStripHelpers";
import {
  phoenixTH,
  phoenixTD,
  phoenixTR,
  PHOENIX_PANEL_SURFACE_STYLE,
} from "@/components/shared/phoenixPanelHelpers";
import {
  desktopConnectHeading,
  desktopConnectErrorBox,
} from "@/components/desktopConnect/desktopConnectHelpers";

describe("residual catalog atoms batch P", () => {
  it("folder picker chrome", () => {
    expect(FOLDER_PICKER_OVERLAY_STYLE.zIndex).toBe(2000);
    expect(FOLDER_PICKER_DIALOG_STYLE.borderRadius).toBe(10);
    expect(folderPickerBtnStyle("primary").background).toBe("var(--accent)");
    expect(folderPickerBtnStyle("secondary").background).toBe("transparent");
  });

  it("kpi accent and phoenix panel chrome", () => {
    expect(KPI_ACCENT_MAP.blue.color).toBe("var(--status-info)");
    expect(resolveKpiAccent("purple").color).toBe("var(--status-warning)");
    expect(resolveKpiAccent(undefined).color).toBe("var(--accent)");
    expect(phoenixTH.fontSize).toBe(8);
    expect(phoenixTD.padding).toBe("8px 12px");
    expect(phoenixTR(true, false).borderLeft).toContain("status-error");
    expect(PHOENIX_PANEL_SURFACE_STYLE.borderRadius).toBe("16px");
  });

  it("desktop connect chrome", () => {
    expect(desktopConnectHeading.fontSize).toBe(24);
    expect(desktopConnectErrorBox.color).toBe("var(--status-error)");
  });
});
