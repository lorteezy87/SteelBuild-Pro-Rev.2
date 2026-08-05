import { describe, expect, it } from "vitest";
import {
  buildSecureDeleteStyles,
  SECURE_DELETE_OVERLAY_STYLE,
  secureDeleteOwnerValueStyle,
  secureDeleteConfirmBtnStyle,
} from "@/components/shared/secureDeleteDialogHelpers";
import {
  WEATHER_DESCRIPTIONS,
  describeWeatherCode,
} from "@/components/shared/weatherHelpers";
import {
  RFI_CSV_COLUMN_ALIASES,
  RFI_CSV_MONTHS,
  RFI_CSV_JOB_NUMBER_ALIASES,
} from "@/lib/importRfiCsvHelpers";
import { ROLE_LABELS } from "@/lib/projectMembers";
import { DELTA_LABEL } from "@/lib/rfiFromDelta";
import { ganttBarShellStyle, BAR_HEIGHT } from "@/components/schedule/scheduleGanttHelpers";

describe("residual catalog atoms batch L", () => {
  it("secure delete chrome styles", () => {
    expect(SECURE_DELETE_OVERLAY_STYLE.zIndex).toBe(9999);
    expect(secureDeleteOwnerValueStyle(true).color).toBe("var(--status-success)");
    expect(secureDeleteOwnerValueStyle(false).color).toBe("var(--status-warning)");
    expect(secureDeleteConfirmBtnStyle(true).cursor).toBe("pointer");
    expect(secureDeleteConfirmBtnStyle(false).cursor).toBe("not-allowed");
    const S = buildSecureDeleteStyles({
      isOwner: true,
      typed: "DELETE",
      typedValue: "DELETE",
      canConfirm: true,
    });
    expect(S.typeInput.border).toContain("success");
    expect(S.deleteBtn.background).toBe("var(--status-error)");
  });

  it("weather descriptions and rfi/member catalogs", () => {
    expect(WEATHER_DESCRIPTIONS[0]).toBe("Clear sky");
    expect(describeWeatherCode(95)).toBe("Thunderstorm");
    expect(describeWeatherCode(999)).toBe("Unknown");
    expect(RFI_CSV_COLUMN_ALIASES.title).toContain("subject");
    expect(RFI_CSV_MONTHS.jan).toBe(1);
    expect(RFI_CSV_JOB_NUMBER_ALIASES).toContain("job number");
    expect(ROLE_LABELS.pm).toBe("PM");
    expect(DELTA_LABEL.grid_shift).toBe("grid shift");
  });

  it("gantt bar shell style", () => {
    const shell = ganttBarShellStyle(12, 80);
    expect(shell.left).toBe(12);
    expect(shell.width).toBe(80);
    expect(shell.height).toBe(BAR_HEIGHT);
    expect(shell.position).toBe("absolute");
  });
});
