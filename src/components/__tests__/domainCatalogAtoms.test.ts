import { describe, expect, it } from "vitest";
import {
  RFI_BULK_PRIORITIES,
  RFI_BULK_STATUSES,
  RFI_BULK_BIC_CHOICES,
} from "../rfis/rfiBulkEditModalHelpers";
import { VENDOR_TYPES, EMPTY_VENDOR_FORM } from "../vendors/vendorFormModalHelpers";
import {
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_CATEGORY_OPTIONS,
  DOCUMENT_DISCIPLINE_OPTIONS,
} from "../dms/documentEditModalStyleHelpers";
import {
  FILE_TYPE_CONFIG,
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_STYLE,
} from "../dms/documentCardHelpers";
import { RESULT_COLORS, QC_STATUS_COLORS } from "../qc/qcListHelpers";
import {
  SUBMITTAL_BULK_STATUSES,
  SUBMITTAL_BULK_BIC_CHOICES,
  SUBMITTAL_BULK_TYPES,
} from "../submittals/submittalBulkEditModalStyleHelpers";
import {
  RESPONSE_COLORS,
  RESPONSE_ABBR,
  DEFAULT_RESPONSE_COLOR,
} from "../submittals/responseMatrixHelpers";
import { AGING_THRESHOLDS, AGING_COLUMNS } from "../submittals/agingReportTableHelpers";
import { CYCLE_TIME_WINDOWS } from "../submittals/cycleTimeCardHelpers";
import { FORECAST_RISK_CFG } from "../submittals/submittalForecastCardHelpers";
import { SCOPE_CATEGORIES } from "../scope/bulkScopeHelpers";
import { WARRANTY_TYPE_COLORS } from "../warranty/warrantyListHelpers";
import { SEV_COLOR, DELTA_LABEL } from "../drawings/revisionDeltaCardHelpers";
import { GANTT_QUICK_FILTERS } from "../schedule/scheduleGanttHelpers";
import {
  BULK_DURATION_FIELD_STYLE,
  BULK_DURATION_MONO_LABEL,
} from "../schedule/bulkDurationEditHelpers";
import {
  NOTIFICATION_PREFS,
  NOTIFICATION_THRESHOLDS,
  QUIET_HOURS_DEFAULTS,
} from "../settings/notificationsTabHelpers";

describe("domain pure catalog atoms", () => {
  it("rfi bulk catalogs", () => {
    expect(RFI_BULK_PRIORITIES).toContain("Critical");
    expect(RFI_BULK_STATUSES).toContain("Answered");
    expect(RFI_BULK_BIC_CHOICES).toContain("EOR");
  });

  it("vendor form", () => {
    expect(VENDOR_TYPES).toContain("Fabricator");
    expect(EMPTY_VENDOR_FORM.vendor_type).toBe("Supplier");
    expect(EMPTY_VENDOR_FORM.status).toBe("Active");
  });

  it("document options and card tones", () => {
    expect(DOCUMENT_STATUS_OPTIONS).toContain("Draft");
    expect(DOCUMENT_CATEGORY_OPTIONS).toContain("Shop Drawing");
    expect(DOCUMENT_DISCIPLINE_OPTIONS).toContain("Structural");
    expect(FILE_TYPE_CONFIG.pdf.icon).toBe("PDF");
    expect(DOCUMENT_STATUS_COLORS.Approved.color).toContain("success");
    expect(DOCUMENT_CATEGORY_COLORS.Contract.border).toContain("accent");
    expect(DEFAULT_CATEGORY_STYLE.color).toContain("muted");
  });

  it("qc tones", () => {
    expect(RESULT_COLORS.Pass).toContain("success");
    expect(QC_STATUS_COLORS.Pending).toContain("warning");
  });

  it("submittal catalogs", () => {
    expect(SUBMITTAL_BULK_STATUSES).toContain("Under Review");
    expect(SUBMITTAL_BULK_BIC_CHOICES).toContain("Detailer");
    expect(SUBMITTAL_BULK_TYPES).toContain("Shop Drawing");
    expect(RESPONSE_ABBR["No Exception"]).toBe("NE");
    expect(RESPONSE_COLORS.Rejected.color).toContain("error");
    expect(DEFAULT_RESPONSE_COLOR.bg).toContain("surface");
    expect(AGING_THRESHOLDS).toEqual([3, 7, 14, 30]);
    expect(AGING_COLUMNS).toHaveLength(6);
    expect(CYCLE_TIME_WINDOWS.map((w) => w.key)).toEqual([30, 60, 90, 365, 0]);
    expect(FORECAST_RISK_CFG.high.color).toContain("error");
  });

  it("scope warranty revision gantt styles", () => {
    expect(SCOPE_CATEGORIES).toContain("Misc Metals");
    expect(WARRANTY_TYPE_COLORS.Material).toContain("info");
    expect(SEV_COLOR.critical).toBe("#F85149");
    expect(DELTA_LABEL.grid_shift).toBe("Grid shift");
    expect(GANTT_QUICK_FILTERS[0].key).toBe("all");
    expect(GANTT_QUICK_FILTERS).toHaveLength(14);
    expect(BULK_DURATION_FIELD_STYLE.textAlign).toBe("center");
    expect(BULK_DURATION_MONO_LABEL.fontSize).toBe(10);
  });

  it("notification prefs", () => {
    expect(NOTIFICATION_PREFS.length).toBe(14);
    expect(NOTIFICATION_THRESHOLDS[0].default).toBe(7);
    expect(QUIET_HOURS_DEFAULTS.quiet_hours_start).toBe("18:00");
  });
});
