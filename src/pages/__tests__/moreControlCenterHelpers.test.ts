import { describe, expect, it } from "vitest";
import { healthTone } from "../projects/projectsControlCenterHelpers";
import { urgencyTone as fieldUrgency } from "../fieldToday/fieldTodayControlCenterHelpers";
import { fmtDate } from "../fieldHub/fieldHubControlCenterHelpers";
import { urgencyTone, panelToneToPillTone } from "../commandCenter/commandCenterControlCenterHelpers";
import { decisionTone } from "../../components/drawings/register/reviewQueuePanelHelpers";
import { logMeta } from "../../components/drawings/drawingLogImportModalHelpers";
import { formForTransmittal, headerPatch } from "../../components/drawings/register/transmittalLogPanelHelpers";
import { fmtMD } from "../../components/shared/relatedScheduleTasksChipsHelpers";
import { syncStatusLabel } from "../../components/dms/documentStorageSettingsHelpers";
import { cancelButtonStyle, uploadButtonStyle } from "../../components/photos/photoUploadModalHelpers";

describe("more pure helpers", () => {
  it("health / urgency / panel tones", () => {
    expect(healthTone("At Risk")).toBe("danger");
    expect(fieldUrgency("due-today")).toBe("warn");
    expect(urgencyTone("blocking")).toBe("danger");
    expect(panelToneToPillTone("warn")).toBe("warn");
    expect(decisionTone("approved_with_notes")).toBe("info");
  });
  it("field hub date + sync label + logMeta", () => {
    expect(fmtDate("2026-08-05")).toBe("Aug 5");
    expect(fmtDate(null)).toBe("—");
    expect(syncStatusLabel("success")).toBe("Synced");
    expect(logMeta({ detailer: "A" }).drawing_log.detailer).toBe("A");
  });
  it("transmittal form map", () => {
    const form = formForTransmittal(
      { transmittal_number: "T-1", direction: "incoming", subject: "S", notes: "n" },
      () => ({ party: "ACME", date: "2026-08-01" }),
    );
    expect(form.party).toBe("ACME");
    expect(headerPatch(form).received_from).toBe("ACME");
    expect(headerPatch(form).sent_to).toBeNull();
  });
  it("fmtMD and button styles", () => {
    expect(fmtMD("2026-08-05")).toMatch(/Aug/);
    expect(cancelButtonStyle(true).opacity).toBe(0.5);
    expect(uploadButtonStyle(false).background).toBe("var(--accent)");
  });
});
