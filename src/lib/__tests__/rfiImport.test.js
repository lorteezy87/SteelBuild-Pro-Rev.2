import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn() },
  },
}));

vi.mock("@/api/supabaseClient", () => ({
  integrations: { Core: { UploadFile: vi.fn() } },
}));

import { parseRfiCsv } from "../importRfiCsv";
import { buildRfiImportRows } from "../importRfiLog";
import { normalizeRfiNumber, rfiNumberDedupKey } from "../rfiImportUtils";

describe("RFI import helpers", () => {
  it("normalizes RFI numbers to the app format and dedupes by numeric value", () => {
    expect(normalizeRfiNumber("1")).toBe("RFI #001");
    expect(normalizeRfiNumber("RFI-001")).toBe("RFI #001");
    expect(rfiNumberDedupKey("RFI #001")).toBe("1");
    expect(rfiNumberDedupKey("001")).toBe("1");
  });

  it("parses tab-delimited RFI logs accepted by the upload UI", () => {
    const parsed = parseRfiCsv("RFI #\tSubject\tDate Submitted\tDue Date\n1\tGrid conflict\t5/1/2026\t5/8/2026");

    expect(parsed.rfis).toHaveLength(1);
    expect(parsed.rfis[0]).toMatchObject({
      rfi_number: "1",
      title: "Grid conflict",
      iso_submitted: "2026-05-01",
      iso_required: "2026-05-08",
    });
  });

  it("builds DB-safe RFI rows when imported rows have no submitted date", () => {
    const { rows, skipped } = buildRfiImportRows({
      projectId: "project-1",
      projectName: "Test Project",
      existingNumbers: new Set(["1"]),
      rfis: [
        { rfi_number: "RFI #001", title: "Duplicate" },
        { rfi_number: "2", title: "Missing submitted date", assigned_to: "Engineer" },
      ],
    });

    expect(skipped).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      project_id: "project-1",
      project_name: "Test Project",
      rfi_number: "RFI #002",
      title: "Missing submitted date",
      status: "Open",
      ball_in_court: "Engineer",
    });
    expect(rows[0].submitted_date).toBeNull();
  });

  it("marks answered imported RFIs closed", () => {
    const { rows } = buildRfiImportRows({
      projectId: "project-1",
      rfis: [
        { rfi_number: "3", title: "Answered RFI", iso_answered: "2026-05-10" },
      ],
    });

    expect(rows[0]).toMatchObject({
      rfi_number: "RFI #003",
      status: "Closed",
      date_answered: "2026-05-10",
    });
  });

  it("fails visibly instead of turning a yearless date into 2001", () => {
    expect(() => buildRfiImportRows({
      projectId: "project-1",
      rfis: [
        {
          rfi_number: "13",
          title: "Roof drain clarification",
          date_submitted: "8/4",
          iso_submitted: "2001-08-04",
        },
      ],
    })).toThrow(/RFI #013.*submitted date.*missing a year/i);
  });

  it("round-trips SteelBuild Pro's own rfi-log.csv export", () => {
    const csv = [
      `"RFI #","Project","Title","Priority","Status","Ball in Court","Submitted By","Submitted Date","Date Required","Date Answered","Answered By","Drawing Ref","Spec Section","Assigned To","Days Open","Cost Impact","Cost Amount","Schedule Impact","Schedule Days","Question","Answer"`,
      `"RFI-006","BIMC ED (26179)","Existing slab edge","High","Answered","Architect","Nick Lortz (S&H Steel)","2026-07-13","2026-07-20","2026-07-17","PK Associates (EOR) - TK","SE102-A","05 12 00","Mortenson","4","Yes","1,250","No","","Provide the edge-of-slab distance, please.","1'-5"" off Grid 2; verify in field."`,
    ].join("\n");

    const { rows } = buildRfiImportRows({ projectId: "project-1", rfis: parseRfiCsv(csv).rfis });

    expect(rows[0]).toMatchObject({
      rfi_number: "RFI #006",
      title: "Existing slab edge",
      question: "Provide the edge-of-slab distance, please.",
      answer: `1'-5" off Grid 2; verify in field.`,
      answered_by: "PK Associates (EOR) - TK",
      drawing_reference: "SE102-A",
      spec_section: "05 12 00",
      submitted_by: "Nick Lortz (S&H Steel)",
      assigned_to: "Mortenson",
      ball_in_court: "Architect",
      status: "Answered",
      priority: "High",
      date_answered: "2026-07-17",
      cost_impact: true,
      cost_impact_amount: 1250,
      schedule_impact: false,
      schedule_impact_days: null,
    });
  });

  it("ignores unrecognised status values and never imports Void", () => {
    const { rows } = buildRfiImportRows({
      projectId: "project-1",
      rfis: [
        { rfi_number: "4", title: "Pending", status: "Pending" },
        { rfi_number: "5", title: "Voided", status: "Void", iso_answered: "2026-05-10" },
      ],
    });

    expect(rows.map((r) => r.status)).toEqual(["Open", "Closed"]);
  });
});
