import { describe, expect, it } from "vitest";
import {
  btnPrimary,
  btnSecondary,
  btnDanger,
  inputStyle,
  labelStyle,
  PHOENIX_OVERLAY_STYLE,
  phoenixDialogStyle,
  PHOENIX_HEADER_STYLE,
} from "@/components/shared/phoenixModalHelpers";
import { CO_CSV_COLUMN_ALIASES, CO_CSV_MONTHS } from "@/lib/importChangeOrderCsvHelpers";
import { SOV_HEADER_ALIASES } from "@/lib/importSovSpreadsheetHelpers";
import { REVISION_UPLOAD_STEP_ORDER } from "@/components/drawings/revisionUploadHelpers";
import { parseLogDate } from "@/lib/importDrawingLog";

describe("residual catalog atoms batch M", () => {
  it("phoenix modal chrome tokens", () => {
    expect(btnPrimary.fontWeight).toBe(700);
    expect(btnSecondary.cursor).toBe("pointer");
    expect(btnDanger.color).toBe("var(--status-error)");
    expect(inputStyle.minHeight).toBe(38);
    expect(labelStyle.textTransform).toBe("uppercase");
    expect(PHOENIX_OVERLAY_STYLE.zIndex).toBe(1200);
    expect(phoenixDialogStyle(720).maxWidth).toBe(720);
    expect(PHOENIX_HEADER_STYLE.display).toBe("flex");
  });

  it("CO/SOV import catalogs and revision steps", () => {
    expect(CO_CSV_COLUMN_ALIASES.co_number).toContain("co #");
    expect(CO_CSV_MONTHS.january).toBe(1);
    expect(SOV_HEADER_ALIASES.scheduled_value).toContain("scheduled value");
    expect(SOV_HEADER_ALIASES.cost_code).toContain("cc");
    expect(REVISION_UPLOAD_STEP_ORDER[0]).toBe("selectSet");
    expect(REVISION_UPLOAD_STEP_ORDER).toContain("comparison");
  });

  it("drawing log still parses abbreviated month dates", () => {
    expect(parseLogDate("14-Nov-25")).toBe("2025-11-14");
    expect(parseLogDate("2026-01-05")).toBe("2026-01-05");
  });
});
