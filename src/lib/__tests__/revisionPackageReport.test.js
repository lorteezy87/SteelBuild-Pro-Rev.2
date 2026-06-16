import { describe, it, expect } from "vitest";
import {
  downstreamStatus,
  selectChangedSheets,
  summarizePackageReport,
} from "@/lib/revisionPackageReport";

const TODAY = "2026-06-16";

describe("downstreamStatus", () => {
  it("returns the furthest-reached stage (field > delivered > fabricated)", () => {
    expect(downstreamStatus({ fabrication_finish_date: "2026-06-01", final_delivery_date: "2026-06-10", ready_for_install_date: "2026-06-15" }, TODAY)).toBe("in the field");
    expect(downstreamStatus({ fabrication_finish_date: "2026-06-01", final_delivery_date: "2026-06-10" }, TODAY)).toBe("delivered");
    expect(downstreamStatus({ fabrication_finish_date: "2026-06-01" }, TODAY)).toBe("fabricated");
  });
  it("ignores future dates and returns null when nothing reached", () => {
    expect(downstreamStatus({ fabrication_finish_date: "2026-12-01" }, TODAY)).toBeNull();
    expect(downstreamStatus({}, TODAY)).toBeNull();
    expect(downstreamStatus(null, TODAY)).toBeNull();
  });
});

describe("selectChangedSheets", () => {
  const sheets = [
    { id: "s1", sheet_number: "S2.1", file_url: "cur1.pdf", pdf_page: 1, fabrication_finish_date: "2026-06-01" },
    { id: "s2", sheet_number: "S1.0", file_url: "cur2.pdf", pdf_page: 2 },
    { id: "s3", sheet_number: "S3.0", file_url: "cur3.pdf" }, // unchanged
    { id: "s4", sheet_number: "S4.0", file_url: "cur4.pdf" }, // changed but no prior file
  ];
  const revisions = [
    // s1: changed, has prior with file -> renderable; sheet is fabricated -> downstream
    { id: "r1a", drawing_id: "s1", is_current: false, version_number: 1, file_url: "old1.pdf", pdf_page: 1 },
    { id: "r1b", drawing_id: "s1", is_current: true, version_number: 2, supersedes_revision_id: "r1a", file_url: "cur1.pdf", pdf_page: 1 },
    // s2: changed, has prior with file -> renderable; not downstream
    { id: "r2a", drawing_id: "s2", is_current: false, version_number: 1, file_url: "old2.pdf", pdf_page: 2 },
    { id: "r2b", drawing_id: "s2", is_current: true, version_number: 2, supersedes_revision_id: "r2a", file_url: "cur2.pdf", pdf_page: 2 },
    // s3: only v1 current -> unchanged -> excluded
    { id: "r3a", drawing_id: "s3", is_current: true, version_number: 1, file_url: "cur3.pdf" },
    // s4: current supersedes a prior that has NO file_url -> changed but NOT renderable
    { id: "r4a", drawing_id: "s4", is_current: false, version_number: 1, file_url: null },
    { id: "r4b", drawing_id: "s4", is_current: true, version_number: 2, supersedes_revision_id: "r4a", file_url: "cur4.pdf" },
  ];

  it("includes only changed sheets and resolves the from/to pair", () => {
    const out = selectChangedSheets(sheets, revisions, { today: TODAY });
    const ids = out.map((e) => e.drawing.id);
    expect(ids).not.toContain("s3"); // unchanged excluded
    expect(ids).toContain("s1");
    expect(ids).toContain("s2");
    expect(ids).toContain("s4");
    const s1 = out.find((e) => e.drawing.id === "s1");
    expect(s1).toMatchObject({ fromRevisionId: "r1a", toRevisionId: "r1b", renderable: true });
    expect(s1.fromFile).toEqual({ fileUrl: "old1.pdf", pdfPage: 1 });
    expect(s1.toFile).toEqual({ fileUrl: "cur1.pdf", pdfPage: 1 });
  });

  it("flags a changed sheet with no comparable prior file as not renderable", () => {
    const out = selectChangedSheets(sheets, revisions, { today: TODAY });
    const s4 = out.find((e) => e.drawing.id === "s4");
    expect(s4.renderable).toBe(false);
  });

  it("sorts downstream-impacted sheets first", () => {
    const out = selectChangedSheets(sheets, revisions, { today: TODAY });
    // s1 is fabricated (downstream) so it leads despite a higher sheet number than s2.
    expect(out[0].drawing.id).toBe("s1");
    expect(out[0].downstream).toBe("fabricated");
  });
});

describe("summarizePackageReport", () => {
  it("rolls up non-dismissed deltas by severity and counts downstream exposure", () => {
    const summary = summarizePackageReport([
      {
        sheetNumber: "S2.1", downstream: "fabricated", renderable: true,
        deltas: [
          { severity: "critical", delta_type: "material_change" },
          { severity: "low", delta_type: "callout_added", dismissed: true }, // dismissed -> ignored
        ],
      },
      {
        sheetNumber: "S1.0", downstream: null, renderable: true,
        deltas: [{ severity: "medium", delta_type: "dimension_change" }],
      },
      { sheetNumber: "S4.0", downstream: "delivered", renderable: false, deltas: [] }, // blocked
      { sheetNumber: "S5.0", downstream: null, renderable: true, error: "boom" },
    ]);

    expect(summary.sheetsChanged).toBe(4);
    expect(summary.sheetsBlocked).toBe(1);
    expect(summary.errorCount).toBe(1);
    expect(summary.totalDeltas).toBe(2); // dismissed one excluded
    expect(summary.bySeverity.critical).toBe(1);
    expect(summary.bySeverity.medium).toBe(1);
    expect(summary.byDeltaType.material_change).toBe(1);
    // S2.1 is downstream AND has a critical delta -> exposure; S4.0 downstream but no hot delta.
    expect(summary.downstreamExposure).toBe(1);
  });

  it("is safe on empty / missing input", () => {
    const s = summarizePackageReport([]);
    expect(s.sheetsChanged).toBe(0);
    expect(s.totalDeltas).toBe(0);
    expect(summarizePackageReport(null).sheetsChanged).toBe(0);
  });
});
