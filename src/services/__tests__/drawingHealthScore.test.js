import { describe, it, expect } from "vitest";
import { calculateDrawingHealthScore, summarizeFleetHealth } from "../drawingHealthScore";

const TODAY = "2026-06-16";
const ctx = (over = {}) => ({ today: TODAY, rfis: [], revisions: [], ...over });
const factor = (res, key) => res.factors.find((f) => f.key === key);

// A spotless set: released submittal, no RFIs/revisions, on schedule, all sheets, no flags.
function perfectPkg() {
  return {
    setId: "set1",
    name: "Main Steel - IFC",
    parent: { id: "set1", set_name: "Main Steel - IFC", due_date: "2999-01-01", sheet_count: 2, material_impacted: false, long_lead_impact: false },
    sheets: [
      { id: "d1", sheet_number: "S1.1", due_date: "2999-01-01", linked_rfi_ids: null, is_superseded: false },
      { id: "d2", sheet_number: "S1.2", due_date: "2999-01-01", linked_rfi_ids: null, is_superseded: false },
    ],
    submittals: [{ id: "s1", status: "Released for Fabrication", ball_in_court: null, round_number: 1, is_deleted: false }],
  };
}

describe("calculateDrawingHealthScore", () => {
  it("scores a spotless set 100 / A / excellent", () => {
    const res = calculateDrawingHealthScore(perfectPkg(), ctx());
    expect(res.score).toBe(100);
    expect(res.grade).toBe("A");
    expect(res.band.key).toBe("excellent");
    expect(res.issues).toHaveLength(0);
    expect(res.factors.reduce((s, f) => s + f.weight, 0)).toBe(100); // weights sum to 100
  });

  it("deducts for open linked RFIs (matched by normalized number, drafts/closed excluded)", () => {
    const pkg = perfectPkg();
    pkg.sheets[0].linked_rfi_ids = "RFI-001, RFI-002, RFI-009";
    const rfis = [
      { rfi_number: "RFI-001", status: "Open", is_deleted: false },
      { rfi_number: "RFI-002", status: "open", is_deleted: false },
      { rfi_number: "RFI-009", status: "Closed", is_deleted: false }, // resolved → not counted
      { rfi_number: "RFI-050", status: "Open", is_deleted: false }, // not linked → ignored
    ];
    const res = calculateDrawingHealthScore(pkg, ctx({ rfis }));
    expect(factor(res, "openRfis").deduction).toBe(16); // 2 open * 8
    expect(res.score).toBe(84);
    expect(res.grade).toBe("B");
  });

  it("deducts for overdue aging and an un-approved stage", () => {
    const pkg = {
      setId: "set3",
      name: "Anchor Bolts",
      parent: { due_date: "2026-05-01", sheet_count: 1 }, // 46 days overdue vs TODAY
      sheets: [{ id: "d", due_date: "2026-05-01", linked_rfi_ids: null, is_superseded: false }],
      submittals: [{ status: "Submitted", ball_in_court: "EOR", round_number: 1, is_deleted: false }],
    };
    const res = calculateDrawingHealthScore(pkg, ctx());
    expect(factor(res, "aging").deduction).toBe(14); // capped (>30 days overdue)
    expect(factor(res, "approval").deduction).toBeGreaterThan(0);
    expect(res.score).toBeLessThan(80);
  });

  it("deducts for R&R churn on a later round", () => {
    const pkg = perfectPkg();
    pkg.submittals = [{ status: "Revise and Resubmit", ball_in_court: "Detailer", round_number: 2, is_deleted: false }];
    const res = calculateDrawingHealthScore(pkg, ctx());
    const sub = factor(res, "submittal");
    expect(sub.deduction).toBe(11); // 0.6*12=7 (R&R) + (2-1)*4=4
    expect(sub.severity).toBe("critical");
  });

  it("deducts for manual readiness flags", () => {
    const pkg = perfectPkg();
    pkg.parent.material_impacted = true;
    pkg.parent.long_lead_impact = true;
    const res = calculateDrawingHealthScore(pkg, ctx());
    expect(factor(res, "readiness").deduction).toBe(12);
    expect(res.score).toBe(88);
  });

  it("deducts for missing sheets (expected vs present)", () => {
    const pkg = perfectPkg();
    pkg.parent.sheet_count = 4; // but only 2 present
    const res = calculateDrawingHealthScore(pkg, ctx());
    expect(factor(res, "missingSheets").deduction).toBe(4); // round(2/4 * 8)
  });

  it("deducts revision risk, larger when the revised sheet is already downstream", () => {
    const pkg = perfectPkg();
    pkg.sheets = [{ id: "d1", sheet_number: "S1", is_superseded: false, fabrication_finish_date: "2026-05-01", file_url: "u2", pdf_page: 1 }];
    pkg.parent.sheet_count = 1;
    const revisions = [
      { id: "r2", drawing_id: "d1", is_current: true, supersedes_revision_id: "r1", version_number: 2, file_url: "u2", pdf_page: 1 },
      { id: "r1", drawing_id: "d1", is_current: false, version_number: 1, file_url: "u1", pdf_page: 1 },
    ];
    const res = calculateDrawingHealthScore(pkg, ctx({ revisions }));
    expect(factor(res, "revisionRisk").deduction).toBe(18); // downstream (fabricated) → full weight
    expect(factor(res, "revisionRisk").detail.toLowerCase()).toContain("downstream");
  });

  it("does not throw and contributes 0 revision risk when no revisions are provided", () => {
    const res = calculateDrawingHealthScore(perfectPkg(), ctx({ revisions: [] }));
    expect(factor(res, "revisionRisk").deduction).toBe(0);
  });

  it("bottoms out a neglected set at F / critical", () => {
    const pkg = {
      setId: "bad",
      name: "Neglected",
      parent: { due_date: "2026-01-01", sheet_count: 6, material_impacted: true, long_lead_impact: true },
      sheets: [{ id: "d", due_date: "2026-01-01", linked_rfi_ids: "RFI-1 RFI-2 RFI-3", is_superseded: false }],
      submittals: [], // never submitted → Not Started
    };
    const rfis = [
      { rfi_number: "RFI-1", status: "Open", is_deleted: false },
      { rfi_number: "RFI-2", status: "Open", is_deleted: false },
      { rfi_number: "RFI-3", status: "Open", is_deleted: false },
    ];
    const res = calculateDrawingHealthScore(pkg, ctx({ rfis }));
    expect(res.grade).toBe("F");
    expect(res.band.key).toBe("critical");
    expect(res.issues.length).toBeGreaterThanOrEqual(4);
  });
});

describe("summarizeFleetHealth", () => {
  it("rolls grade/band distribution, average, and worst-first list", () => {
    const a = calculateDrawingHealthScore(perfectPkg(), ctx()); // 100 / A
    const badPkg = perfectPkg();
    badPkg.submittals = [];
    badPkg.parent.sheet_count = 4; // missing 2
    badPkg.sheets[0].linked_rfi_ids = "RFI-1";
    const b = calculateDrawingHealthScore(badPkg, ctx({ rfis: [{ rfi_number: "RFI-1", status: "Open", is_deleted: false }] }));

    const fleet = summarizeFleetHealth([a, b]);
    expect(fleet.count).toBe(2);
    expect(fleet.byGrade.A).toBe(1);
    expect(fleet.averageScore).toBe(Math.round((a.score + b.score) / 2));
    expect(fleet.worst[0].score).toBeLessThanOrEqual(fleet.worst[1].score); // worst first
  });

  it("is a perfect-average no-op on an empty fleet", () => {
    const fleet = summarizeFleetHealth([]);
    expect(fleet.count).toBe(0);
    expect(fleet.averageScore).toBe(100);
    expect(fleet.worst).toHaveLength(0);
  });
});
