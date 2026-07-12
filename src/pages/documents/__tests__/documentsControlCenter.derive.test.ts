import { describe, it, expect } from "vitest";
import {
  isRecent,
  fmtSizeKb,
  categoryBreakdown,
  buildDocumentsSummary,
  buildFolderPath,
  scopeDocsToFolder,
  filterDocsForCommandUi,
  planFolderDeletion,
} from "../documentsControlCenter.derive";
import type { CommandUiFilterInput, DocumentRecord, FolderRecord } from "../documentsControlCenter.derive";

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

// ---------------------------------------------------------------------------
// Folder scoping (command_ui folder browsing)
// ---------------------------------------------------------------------------
const FOLDERS: FolderRecord[] = [
  { id: "f1", name: "Structural", parent_folder_id: null },
  { id: "f2", name: "Shop Drawings", parent_folder_id: "f1" },
  { id: "f3", name: "Erection", parent_folder_id: "f2" },
  { id: "f4", name: "Civil", parent_folder_id: null },
];

describe("buildFolderPath", () => {
  it("returns an empty path at root", () => {
    expect(buildFolderPath(FOLDERS, null)).toEqual([]);
  });
  it("returns a root-first path for a nested folder", () => {
    expect(buildFolderPath(FOLDERS, "f3").map((f) => f.name)).toEqual([
      "Structural",
      "Shop Drawings",
      "Erection",
    ]);
  });
  it("returns a single entry for a top-level folder", () => {
    expect(buildFolderPath(FOLDERS, "f1").map((f) => f.name)).toEqual(["Structural"]);
  });
  it("returns an empty path for an unknown folder id", () => {
    expect(buildFolderPath(FOLDERS, "nope")).toEqual([]);
  });
  it("terminates on a cycle instead of hanging", () => {
    const cyclic: FolderRecord[] = [
      { id: "a", name: "A", parent_folder_id: "b" },
      { id: "b", name: "B", parent_folder_id: "a" },
    ];
    expect(buildFolderPath(cyclic, "a").length).toBe(50);
  });
});

describe("scopeDocsToFolder", () => {
  const docs: DocumentRecord[] = [
    { id: "1", displayName: "root doc", folder_id: null },
    { id: "2", displayName: "no folder key" },
    { id: "3", displayName: "in f1", folder_id: "f1" },
  ];
  it("treats missing folder_id as root", () => {
    expect(scopeDocsToFolder(docs, null).map((d) => d.id)).toEqual(["1", "2"]);
  });
  it("returns only direct children of the folder", () => {
    expect(scopeDocsToFolder(docs, "f1").map((d) => d.id)).toEqual(["3"]);
  });
});

describe("filterDocsForCommandUi", () => {
  const docs: DocumentRecord[] = [
    { id: "1", displayName: "Root Spec",  folder_id: null, category: "General",    status: "Approved",     uploadedDate: "2026-01-03" },
    { id: "2", displayName: "Beam Plan",  folder_id: "f1", category: "Structural", status: "Under Review", uploadedDate: "2026-01-05" },
    { id: "3", displayName: "Beam Detail", folder_id: "f1", category: "Structural", status: "Approved",    uploadedDate: "2026-01-04" },
    { id: "4", displayName: "Site Grade", folder_id: "f4", category: "Civil",      status: "Approved",     uploadedDate: "2026-01-06" },
  ];
  const base: CommandUiFilterInput = { docs, search: "", category: "All", statusTab: "all", currentFolderId: null };

  it("scopes to the current folder when not searching", () => {
    expect(filterDocsForCommandUi(base).map((d) => d.id)).toEqual(["1"]);
    expect(filterDocsForCommandUi({ ...base, currentFolderId: "f1" }).map((d) => d.id)).toEqual(["2", "3"]);
  });

  it("searches across all folders, ignoring folder scope", () => {
    const r = filterDocsForCommandUi({ ...base, currentFolderId: "f4", search: "beam" });
    expect(r.map((d) => d.id)).toEqual(["2", "3"]);
  });

  it("sorts newest-first by uploadedDate", () => {
    const r = filterDocsForCommandUi({ ...base, search: "e" });
    expect(r.map((d) => d.id)).toEqual(["4", "2", "3", "1"]);
  });

  it("applies the category chip on top of folder scope", () => {
    const r = filterDocsForCommandUi({ ...base, currentFolderId: "f1", category: "Structural" });
    expect(r.map((d) => d.id)).toEqual(["2", "3"]);
    expect(filterDocsForCommandUi({ ...base, currentFolderId: "f1", category: "Civil" })).toEqual([]);
  });

  it("applies the status tab on top of folder scope", () => {
    const r = filterDocsForCommandUi({ ...base, currentFolderId: "f1", statusTab: "Under Review" });
    expect(r.map((d) => d.id)).toEqual(["2"]);
  });

  it("treats a missing category as Uncategorized", () => {
    const r = filterDocsForCommandUi({
      ...base,
      docs: [{ id: "x", folder_id: null }],
      category: "Uncategorized",
    });
    expect(r.map((d) => d.id)).toEqual(["x"]);
  });
});

// ---------------------------------------------------------------------------
// planFolderDeletion — soft-delete orphan prevention
// ---------------------------------------------------------------------------
describe("planFolderDeletion", () => {
  // f1 (root) → f2 → f3 ;  f4 (root)
  const docs: DocumentRecord[] = [
    { id: "d1", folder_id: "f1" },
    { id: "d2", folder_id: "f2" },
    { id: "d3", folder_id: "f3" },
    { id: "d4", folder_id: "f4" },
    { id: "d5", folder_id: null },
  ];

  it("promotes a deleted folder's docs and child folders to its parent", () => {
    const p = planFolderDeletion(FOLDERS, docs, ["f2"]);
    expect(p.deleteIds).toEqual(["f2"]);
    expect(p.folderReparents).toEqual([{ id: "f3", parent_folder_id: "f1" }]);
    expect(p.docReparents).toEqual([{ id: "d2", folder_id: "f1" }]);
  });

  it("promotes to root when a top-level folder is deleted", () => {
    const p = planFolderDeletion(FOLDERS, docs, ["f1"]);
    expect(p.folderReparents).toEqual([{ id: "f2", parent_folder_id: null }]);
    expect(p.docReparents).toEqual([{ id: "d1", folder_id: null }]);
  });

  it("skips doomed ancestors when the whole chain is deleted", () => {
    const p = planFolderDeletion(FOLDERS, docs, ["f1", "f2"]);
    // f3 survives; both its ancestors are doomed, so it lands at root.
    expect(p.folderReparents).toEqual([{ id: "f3", parent_folder_id: null }]);
    // d1 and d2 both land at root; d3 is inside surviving f3, untouched.
    expect(p.docReparents).toEqual([
      { id: "d1", folder_id: null },
      { id: "d2", folder_id: null },
    ]);
  });

  it("leaves untouched folders and root documents alone", () => {
    const p = planFolderDeletion(FOLDERS, docs, ["f4"]);
    expect(p.folderReparents).toEqual([]);
    expect(p.docReparents).toEqual([{ id: "d4", folder_id: null }]);
  });

  it("produces nothing to reparent for an empty leaf folder", () => {
    const p = planFolderDeletion(FOLDERS, [], ["f3"]);
    expect(p.folderReparents).toEqual([]);
    expect(p.docReparents).toEqual([]);
    expect(p.deleteIds).toEqual(["f3"]);
  });

  it("deduplicates repeated ids in the delete set", () => {
    const p = planFolderDeletion(FOLDERS, [], ["f3", "f3"]);
    expect(p.deleteIds).toEqual(["f3"]);
  });
});
