import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn() },
  },
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    integrations: { Core: { UploadFile: vi.fn() } },
  },
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
});
