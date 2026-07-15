import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the PDF extractor so the helper tests stay in the node env (the real
// module pulls in pdfjs). extractRevisionSheets is a thin wrapper over it.
vi.mock("@/lib/pdfSheetExtractor", () => ({
  extractSheetsFromPdf: vi.fn(),
}));

import { extractSheetsFromPdf } from "@/lib/pdfSheetExtractor";
import { validateRevisionLabel } from "@/lib/drawingUploadUtils";
import {
  formatBytes,
  CHANGE_STYLE,
  extractRevisionSheets,
  deriveVirtualSets,
  buildRevisionSnapshot,
} from "../revisionUploadHelpers";

describe("formatBytes (revision modal variant)", () => {
  it("rounds KB to whole numbers and has NO sub-KB 'B' tier (divergence from the set modal)", () => {
    // The set modal would render 500 as "500 B"; this modal deliberately does not.
    expect(formatBytes(500)).toBe("0 KB");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB"); // 1.5 KB rounds to 2
  });

  it("renders MB with one decimal at/above 1 MB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("CHANGE_STYLE", () => {
  it("carries a style entry for each diff change kind", () => {
    expect(Object.keys(CHANGE_STYLE).sort()).toEqual(["added", "removed", "revised", "same"]);
    expect(CHANGE_STYLE.revised.label).toBe("✎ REVISED");
  });
});

describe("extractRevisionSheets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the extractor's sheets array on success", async () => {
    extractSheetsFromPdf.mockResolvedValue({ sheets: [{ sheetNumber: "S-1" }] });
    await expect(extractRevisionSheets({})).resolves.toEqual([{ sheetNumber: "S-1" }]);
  });

  it("returns [] when the extractor yields no sheets array", async () => {
    extractSheetsFromPdf.mockResolvedValue({});
    await expect(extractRevisionSheets({})).resolves.toEqual([]);
  });

  it("throws a flagged error on extractFailed so the caller can recover", async () => {
    extractSheetsFromPdf.mockResolvedValue({ extractFailed: true, error: "boom" });
    await expect(extractRevisionSheets({})).rejects.toMatchObject({ message: "boom", extractFailed: true });
  });
});

describe("deriveVirtualSets", () => {
  it("builds one virtual set per name, skipping superseded / no-name / already-known sets", () => {
    const drawings = [
      { drawing_set_name: "Set A", revision_number: 3, is_superseded: false },
      { drawing_set_name: "Set A", revision_number: 3 },       // second sheet → count 2
      { drawing_set_name: "Set B", is_superseded: true },      // excluded: superseded
      { drawing_set_name: "Set C" },                           // excluded: already real
      { sheet_number: "X-1" },                                 // excluded: no set_name
    ];
    const result = deriveVirtualSets(drawings, new Set(["Set C"]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: null, set_name: "Set A", sheet_count: 2, revision: "3", revision_history: "[]" });
  });

  it("coerces a null revision_number to the em-dash placeholder", () => {
    const result = deriveVirtualSets(
      [{ drawing_set_name: "Set D", revision_number: null, is_superseded: false }],
      new Set(),
    );
    expect(result[0].revision).toBe("—");
  });
});

describe("buildRevisionSnapshot", () => {
  it("maps the current set fields into a history entry with the disposition as status", () => {
    const set = { revision: "IFC", issued_date: "2026-01-01", issued_by: "ACME", file_url: "u", sheet_count: 5, notes: "hi" };
    const snap = buildRevisionSnapshot(set, "superseded");
    expect(snap).toMatchObject({
      revisionLabel: "IFC",
      issueDate: "2026-01-01",
      issuedBy: "ACME",
      fileUrl: "u",
      sheetCount: 5,
      notes: "hi",
      status: "superseded",
    });
    expect(typeof snap.uploadedAt).toBe("string");
  });

  it("defaults notes to an empty string when the set has none", () => {
    expect(buildRevisionSnapshot({ revision: "A" }, "reference").notes).toBe("");
  });
});

describe("validateRevisionLabel", () => {
  it("accepts letter revisions before IFC and numeric revisions after IFC", () => {
    expect(validateRevisionLabel("Rev B", "OFA").ok).toBe(true);
    expect(validateRevisionLabel("IFC Rev 2", "IFC").ok).toBe(true);
  });

  it("rejects a letter revision after IFC", () => {
    expect(validateRevisionLabel("Rev C", "Released")).toMatchObject({ ok: false });
  });
});
