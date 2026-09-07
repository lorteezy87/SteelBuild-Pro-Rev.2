import { describe, it, expect } from "vitest";
import { computeRevisionImpact } from "@/lib/detailingRevisionImpact";

const TODAY = "2026-06-01";

describe("computeRevisionImpact", () => {
  it("rates a change-revision on already-in-field steel as critical", () => {
    const drawingsById = new Map([
      ["d1", { id: "d1", sheet_number: "S1.01", drawing_set_name: "Main Steel",
        fabrication_finish_date: "2026-05-01", final_delivery_date: "2026-05-10", ready_for_install_date: "2026-05-20" }],
    ]);
    const revisions = [{ id: "r1", drawing_id: "d1", revision_code: "Bulletin 2", supersedes_revision_id: "r0", issued_at: "2026-05-25" }];
    const rows = computeRevisionImpact({ revisions, drawingsById, today: TODAY });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ severity: "critical", fabricated: true, delivered: true, inField: true, revisionCode: "Bulletin 2", sheetNumber: "S1.01" });
  });

  // Absence of downstream dates is NOT evidence of being upstream. The three
  // date columns are NULL by default and only ever hand-keyed in SheetFormModal,
  // so treating "no dates" as "low" told the user a revision was caught pre-fab
  // on steel that may already be erected.
  it("rates a sheet with NO downstream dates as unknown, not low", () => {
    const drawingsById = new Map([["d2", { id: "d2", sheet_number: "S2.01" }]]);
    const revisions = [{ id: "r2", drawing_id: "d2", version_number: 2, issued_at: "2026-05-26" }];
    const rows = computeRevisionImpact({ revisions, drawingsById, today: TODAY });
    expect(rows[0].severity).toBe("unknown");
    expect(rows[0].downstreamKnown).toBe(false);
    expect(rows[0].fabricated).toBe(false);
  });

  it("rates a sheet WITH downstream dates that have not been reached as low", () => {
    const drawingsById = new Map([
      ["d2", { id: "d2", sheet_number: "S2.01", fabrication_finish_date: "2026-09-01" }],
    ]);
    const revisions = [{ id: "r2", drawing_id: "d2", version_number: 2, issued_at: "2026-05-26" }];
    const rows = computeRevisionImpact({ revisions, drawingsById, today: TODAY });
    expect(rows[0].severity).toBe("low");
    expect(rows[0].downstreamKnown).toBe(true);
    expect(rows[0].fabricated).toBe(false);
  });

  it("rates a revision on a sheet the roster has no row for as unknown", () => {
    const revisions = [{ id: "r9", drawing_id: "missing", version_number: 2, issued_at: "2026-05-26" }];
    const rows = computeRevisionImpact({ revisions, drawingsById: new Map(), today: TODAY });
    expect(rows[0].severity).toBe("unknown");
    expect(rows[0].downstreamKnown).toBe(false);
  });

  it("ranks unknown above low so unverified sheets are not buried", () => {
    const drawingsById = new Map([
      ["dLow", { id: "dLow", sheet_number: "S-LOW", fabrication_finish_date: "2026-09-01" }],
      ["dUnk", { id: "dUnk", sheet_number: "S-UNK" }],
    ]);
    const revisions = [
      { id: "rLow", drawing_id: "dLow", version_number: 2, issued_at: "2026-05-30" },
      { id: "rUnk", drawing_id: "dUnk", version_number: 2, issued_at: "2026-05-26" },
    ];
    const rows = computeRevisionImpact({ revisions, drawingsById, today: TODAY });
    expect(rows.map((r) => r.severity)).toEqual(["unknown", "low"]);
  });

  it("excludes initial issues (v1, no supersede) and archived revisions", () => {
    const revisions = [
      { id: "r3", drawing_id: "d3", version_number: 1 },                 // initial issue
      { id: "r4", drawing_id: "d4", version_number: 3, archived_at: "2026-01-01" }, // archived
    ];
    expect(computeRevisionImpact({ revisions, today: TODAY })).toEqual([]);
  });

  it("sorts critical first, then most-recent issued", () => {
    const drawingsById = new Map([
      ["a", { id: "a", ready_for_install_date: "2026-05-01" }],           // → critical
      ["b", { id: "b", fabrication_finish_date: "2026-05-01" }],          // → medium
    ]);
    const revisions = [
      { id: "rb", drawing_id: "b", version_number: 2, issued_at: "2026-05-30" },
      { id: "ra", drawing_id: "a", version_number: 2, issued_at: "2026-05-10" },
    ];
    const rows = computeRevisionImpact({ revisions, drawingsById, today: TODAY });
    expect(rows.map((r) => r.severity)).toEqual(["critical", "medium"]);
  });
});
