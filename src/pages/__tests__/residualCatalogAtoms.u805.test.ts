import { describe, expect, it } from "vitest";
import {
  MARKUP_PDF_COLORS,
  MARKUP_STATUS_COLOR,
} from "@/lib/exports/markupPdfHelpers";
import { PAY_APP_PDF_COLORS } from "@/lib/payapp/payAppPdfHelpers";
import { DEFENSE_PDF_COLORS } from "@/lib/backcharge/defensePdfHelpers";
import {
  REVISION_IMPACT_SEV_ORDER,
  REVISION_IMPACT_SEV_RGB,
  REVISION_IMPACT_DELTA_LABEL,
} from "@/lib/exports/revisionImpactPdfHelpers";
import { SEVERITY_RANK } from "@/lib/revisionSnapshotDiff";

describe("residual catalog atoms batch U", () => {
  it("markup and pay-app PDF palettes", () => {
    expect(MARKUP_PDF_COLORS.accent).toEqual([200, 155, 32]);
    expect(MARKUP_STATUS_COLOR.addressed).toEqual([22, 163, 74]);
    expect(PAY_APP_PDF_COLORS.accent).toEqual([0, 120, 150]);
    expect(DEFENSE_PDF_COLORS.error).toEqual([220, 38, 38]);
  });

  it("revision impact catalogs and severity rank", () => {
    expect(REVISION_IMPACT_SEV_ORDER[0]).toBe("critical");
    expect(REVISION_IMPACT_SEV_RGB.critical).toEqual([248, 81, 73]);
    expect(REVISION_IMPACT_DELTA_LABEL.grid_shift).toBe("Grid shift");
    expect(SEVERITY_RANK.critical).toBe(0);
    expect(SEVERITY_RANK.info).toBe(4);
  });
});
