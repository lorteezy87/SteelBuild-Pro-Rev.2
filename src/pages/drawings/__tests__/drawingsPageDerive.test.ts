import { describe, expect, it } from "vitest";
import type { Drawing } from "@/hooks/useDrawings";
import type { DrawingSetRow } from "@/components/drawings/drawingsTableDerive";
import {
  deriveDrawingsPageModel,
  type Rfi,
  type Submittal,
} from "../drawingsPageDerive";

const drawing = (patch: Partial<Drawing>): Drawing => ({
  id: "drawing-1",
  project_id: "project-1",
  sheet_number: "S-001",
  title: "Framing plan",
  drawing_set_id: "set-1",
  drawing_set_name: "Structural",
  stage: "IFA",
  ...patch,
} as Drawing);

const drawingSet = {
  id: "set-1",
  project_id: "project-1",
  set_name: "Structural",
} as DrawingSetRow;

function derive(overrides: {
  drawings?: Drawing[];
  rfis?: Rfi[];
  submittals?: Submittal[];
  setFilterId?: string | null;
  selected?: ReadonlySet<string>;
} = {}) {
  return deriveDrawingsPageModel({
    drawings: overrides.drawings ?? [drawing({})],
    rfis: overrides.rfis ?? [],
    submittals: overrides.submittals ?? [],
    drawingSetRecords: [drawingSet],
    filters: {
      search: "",
      discipline: "ALL",
      stageFilter: "ALL",
      setFilterId: overrides.setFilterId ?? null,
    },
    selected: overrides.selected ?? new Set(),
    disciplines: ["Structural", "Architectural"],
    terminalApprovedStatuses: new Set([
      "Approved",
      "Approved as Noted",
      "Released for Fabrication",
    ]),
    workdayDues: false,
  });
}

describe("deriveDrawingsPageModel", () => {
  it("keeps the parent drawing-set record visible for an exact set deep link", () => {
    const model = derive({ setFilterId: "set-1" });

    expect(model.filtered.map((sheet) => sheet.id)).toEqual(["drawing-1"]);
    expect(Object.keys(model.visibleSetMap)).toEqual(["set-1"]);
    expect(model.setFilterLabel).toBe("Structural");
  });

  it("uses linked submittals as the package workflow source of truth", () => {
    const model = derive({
      submittals: [{
        id: "submittal-1",
        drawing_set_ids: ["set-1"],
        status: "Released for Fabrication",
      } as Submittal],
    });

    expect(model.stats.released).toBe(1);
    expect(model.submittalsBySetId["set-1"]).toMatchObject({
      total: 1,
      open: 0,
      latestStatus: "Released for Fabrication",
    });
  });

  it("preserves comma-delimited linked RFI number matching in revision alerts", () => {
    const model = derive({
      drawings: [drawing({ linked_rfi_ids: "RFI #001, RFI #002" })],
      rfis: [
        { id: "rfi-1", rfi_number: "RFI #001", status: "Open" } as Rfi,
        { id: "rfi-2", rfi_number: "RFI #002", status: "Closed" } as Rfi,
      ],
    });

    expect(model.rfiMap["RFI #001"]?.id).toBe("rfi-1");
    expect(model.revisionAlerts.some((alert) =>
      alert.sheets.some((sheet) => sheet.id === "drawing-1"),
    )).toBe(true);
  });

  it("reports one shared set name only when the selection is homogeneous", () => {
    const model = derive({
      drawings: [
        drawing({ id: "drawing-1" }),
        drawing({
          id: "drawing-2",
          drawing_set_id: "set-2",
          drawing_set_name: "Miscellaneous",
        }),
      ],
      selected: new Set(["drawing-1", "drawing-2"]),
    });

    expect(model.selectedSetName).toBeNull();
  });
});
