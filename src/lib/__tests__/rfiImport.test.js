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
      // "Engineer" is not in the vocabulary and chk_rfis_ball_in_court
      // rejects it, so importing a log whose Assigned To column said
      // "Engineer" used to fail the whole row. It is now null -- unknown --
      // NOT EOR: mapping that spelling onto a party is an alias decision,
      // and guessing one would assert an owner the log did not name.
      ball_in_court: null,
    });
    expect(rows[0].submitted_date).toBeNull();
    // The raw spreadsheet text survives, so normalising loses nothing.
    expect(rows[0].assigned_to).toBe("Engineer");
  });

  it("never writes free-text Assigned To into ball_in_court", () => {
    // Real GC logs put a PERSON and their firm in Assigned To. The old
    // default wrote that string straight through, which the constraint
    // rejects -- every unanswered row of the import failed.
    const { rows } = buildRfiImportRows({
      projectId: "project-1",
      rfis: [
        { rfi_number: "10", title: "Person assignee", assigned_to: "Jane Smith, Turner Construction" },
        { rfi_number: "11", title: "Blank assignee" },
        { rfi_number: "12", title: "Real party", assigned_to: "GC" },
        { rfi_number: "13", title: "Whitespace assignee", assigned_to: "   " },
      ],
    });

    // Three outcomes, deliberately different:
    //   an unrecognised name -> null, because we do not know the party. EOR
    //     here would record an RFI that is with the GC as the engineer's, and
    //     a PM would chase the wrong party.
    //   blank (or whitespace) -> EOR, the prior default; the column named
    //     nobody, so nothing is being overridden.
    //   a real party -> taken as given.
    expect(rows.map((r) => r.ball_in_court)).toEqual([null, "EOR", "GC", "EOR"]);
    // The person's name is preserved where it belongs, so nothing is lost by
    // declining to guess a party from it.
    expect(rows[0].assigned_to).toBe("Jane Smith, Turner Construction");
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
