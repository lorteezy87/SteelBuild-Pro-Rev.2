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
      // The source said "Engineer", which chk_rfis_ball_in_court rejects.
      // It is a synonym for EOR and resolves to it rather than failing the
      // import or silently becoming null.
      ball_in_court: "EOR",
    });
    // Nothing is lost by normalising: the raw value stays in assigned_to.
    expect(rows[0].assigned_to).toBe("Engineer");
    expect(rows[0].submitted_date).toBeNull();
  });

  it("does not route a person's name into the ball_in_court party column", () => {
    // assigned_to is free text off a spreadsheet. It used to be written
    // straight to ball_in_court, so every import of an unanswered RFI whose
    // assignee was a person failed the CHECK constraint at the database.
    const { rows } = buildRfiImportRows({
      projectId: "project-1",
      rfis: [{ rfi_number: "7", title: "Open RFI", assigned_to: "John Doe, PE" }],
    });

    expect(rows[0].assigned_to).toBe("John Doe, PE");
    expect(rows[0].ball_in_court).toBe("EOR");
  });

  it("maps an S&H assignee to Subcontractor", () => {
    const { rows } = buildRfiImportRows({
      projectId: "project-1",
      rfis: [{ rfi_number: "8", title: "Open RFI", assigned_to: "S&H" }],
    });

    expect(rows[0].ball_in_court).toBe("Subcontractor");
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
});
