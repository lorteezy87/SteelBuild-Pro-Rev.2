import { describe, it, expect } from "vitest";
import { isRecent, fmtSizeKb, categoryBreakdown, buildDocumentsSummary } from "../documentsControlCenter.derive";
import type { DocumentRecord } from "../documentsControlCenter.derive";

function isoOffset(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// isRecent
// ---------------------------------------------------------------------------
describe("isRecent", () => {
  it("returns false for null/undefined/invalid", () => {
    expect(isRecent(null)).toBe(false);
    expect(isRecent(undefined)).toBe(false);
    expect(isRecent("not-a-date")).toBe(false);
  });
  it("returns true for today and dates within 7 days", () => {
    expect(isRecent(isoOffset(0))).toBe(true);
    expect(isRecent(isoOffset(-6))).toBe(true);
  });
  it("returns false for dates older than the window", () => {
    expect(isRecent(isoOffset(-8))).toBe(false);
    expect(isRecent(isoOffset(-30))).toBe(false);
  });
  it("respects a custom days window", () => {
    expect(isRecent(isoOffset(-3), 2)).toBe(false);
    expect(isRecent(isoOffset(-1), 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fmtSizeKb
// ---------------------------------------------------------------------------
describe("fmtSizeKb", () => {
  it("formats KB under 1024 as plain KB", () => {
    expect(fmtSizeKb(340)).toBe("340 KB");
    expect(fmtSizeKb(0)).toBe("0 KB");
  });
  it("formats values >= 1024 as MB", () => {
    expect(fmtSizeKb(1024)).toBe("1.0 MB");
    expect(fmtSizeKb(2560)).toBe("2.5 MB");
  });
  it("formats values >= 1 GB", () => {
    expect(fmtSizeKb(1024 * 1024)).toBe("1.0 GB");
  });
});

// ---------------------------------------------------------------------------
// categoryBreakdown
// ---------------------------------------------------------------------------
describe("categoryBreakdown", () => {
  const docs: DocumentRecord[] = [
    { id: "1", category: "Structural", fileSizeKb: 500 },
    { id: "2", category: "Structural", fileSizeKb: 300 },
    { id: "3", category: "Electrical", fileSizeKb: 200 },
    { id: "4", category: null,         fileSizeKb: 100 },
  ];

  it("groups by category and sorts by count desc", () => {
    const rows = categoryBreakdown(docs);
    expect(rows[0].category).toBe("Structural");
    expect(rows[0].count).toBe(2);
  });

  it("buckets null category as Uncategorized", () => {
    const rows = categoryBreakdown(docs);
    const unc = rows.find((r) => r.category === "Uncategorized");
    expect(unc?.count).toBe(1);
  });

  it("sums fileSizeKb correctly per category", () => {
    const rows = categoryBreakdown(docs);
    const structural = rows.find((r) => r.category === "Structural");
    expect(structural?.totalSizeKb).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// buildDocumentsSummary
// ---------------------------------------------------------------------------
describe("buildDocumentsSummary", () => {
  const docs: DocumentRecord[] = [
    { id: "1", category: "Structural", status: "Approved",          fileSizeKb: 1024, uploadedDate: isoOffset(-1) },
    { id: "2", category: "Structural", status: "Under Review",      fileSizeKb: 512,  uploadedDate: isoOffset(-3) },
    { id: "3", category: "Electrical", status: "Revise & Resubmit", fileSizeKb: 256,  uploadedDate: isoOffset(-5) },
    { id: "4", category: "Civil",      status: "Draft",             fileSizeKb: 128,  uploadedDate: isoOffset(-10) },
    { id: "5", category: "Civil",      status: "Approved",          fileSizeKb: 64,   uploadedDate: isoOffset(-20) },
  ];

  it("counts total and categories correctly", () => {
    const s = buildDocumentsSummary(docs);
    expect(s.total).toBe(5);
    expect(s.categories).toBe(3); // Structural, Electrical, Civil
  });

  it("counts recent uploads (within 7 days)", () => {
    const s = buildDocumentsSummary(docs);
    // docs 1 (-1d), 2 (-3d), 3 (-5d) are within 7 days
    expect(s.recentCount).toBe(3);
  });

  it("sums totalSizeKb across all docs", () => {
    const s = buildDocumentsSummary(docs);
    expect(s.totalSizeKb).toBe(1024 + 512 + 256 + 128 + 64);
  });

  it("counts needs-review status correctly", () => {
    const s = buildDocumentsSummary(docs);
    expect(s.needsReviewCount).toBe(2); // Under Review + Revise & Resubmit
  });

  it("reviewQueue only includes Under Review / Revise & Resubmit docs", () => {
    const s = buildDocumentsSummary(docs);
    const statuses = s.reviewQueue.map((d) => d.status);
    expect(statuses).not.toContain("Approved");
    expect(statuses).not.toContain("Draft");
    expect(statuses.length).toBe(2);
  });

  it("recentUploads is sorted newest first, capped at 6", () => {
    // Add extra docs to verify cap
    const many: DocumentRecord[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      category: "Test",
      status: "Draft",
      fileSizeKb: 10,
      uploadedDate: isoOffset(-i),
    }));
    const s = buildDocumentsSummary(many);
    expect(s.recentUploads.length).toBeLessThanOrEqual(6);
    // First entry should be the most recent (-0)
    expect(s.recentUploads[0].id).toBe("0");
  });

  it("byCategory is sorted by count desc", () => {
    const s = buildDocumentsSummary(docs);
    expect(s.byCategory[0].category).toBe("Structural"); // count 2
    expect(s.byCategory[0].count).toBe(2);
  });

  it("reviewTone is neutral when no docs need review", () => {
    const clean: DocumentRecord[] = [
      { id: "a", status: "Approved", fileSizeKb: 100, category: "Test" },
    ];
    const s = buildDocumentsSummary(clean);
    expect(s.reviewTone).toBe("neutral");
  });

  it("reviewTone is warn for 1–10 review items", () => {
    const s = buildDocumentsSummary(docs);
    expect(s.reviewTone).toBe("warn");
  });
});
