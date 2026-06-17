import { describe, it, expect } from "vitest";
import {
  isPdfFile, normalizeRevisionNumber, withTimeout, newUploadBatchId,
  getRevisionSuggestions, matchSheets,
} from "@/lib/drawingUploadUtils";

describe("isPdfFile", () => {
  it("detects by MIME or .pdf extension", () => {
    expect(isPdfFile({ type: "application/pdf", name: "a" })).toBe(true);
    expect(isPdfFile({ type: "", name: "Sheet.PDF" })).toBe(true);
    expect(isPdfFile({ type: "image/png", name: "a.png" })).toBe(false);
    expect(isPdfFile(null)).toBe(false);
  });
});

describe("normalizeRevisionNumber", () => {
  it("trims to a non-empty string or the fallback", () => {
    expect(normalizeRevisionNumber("  2 ")).toBe("2");
    expect(normalizeRevisionNumber("")).toBe("0");
    expect(normalizeRevisionNumber(null)).toBe("0");
    expect(normalizeRevisionNumber("   ", "X")).toBe("X");
  });
});

describe("newUploadBatchId", () => {
  it("returns a non-empty, unique-ish id", () => {
    const a = newUploadBatchId();
    const b = newUploadBatchId();
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe("withTimeout", () => {
  it("resolves when the promise settles first", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });
  it("rejects with a retry message when it times out", async () => {
    const never = new Promise(() => {});
    await expect(withTimeout(never, 5, "Upload")).rejects.toThrow(/Upload timed out after .*retry/);
  });
});

describe("getRevisionSuggestions", () => {
  it("walks the IFA/IFB/IFC ladder", () => {
    expect(getRevisionSuggestions("OFA")).toEqual(["IFA", "IFB", "IFC"]);
    expect(getRevisionSuggestions("IFA")).toEqual(["IFB", "IFC"]);
    expect(getRevisionSuggestions("IFC")).toEqual(["IFC Rev 1", "IFC Rev 2", "ADDENDUM 1"]);
  });
  it("increments IFC Rev N", () => {
    expect(getRevisionSuggestions("IFC Rev 2")[0]).toBe("IFC Rev 3");
  });
  it("increments numeric and letter revisions", () => {
    expect(getRevisionSuggestions("3")[0]).toBe("4");
    expect(getRevisionSuggestions("A")[0]).toBe("B");
  });
  it("increments 'Rev N' and 'Rev X' patterns", () => {
    expect(getRevisionSuggestions("Rev 1")[0]).toBe("Rev 2");
    expect(getRevisionSuggestions("Rev A")[0]).toBe("Rev B");
  });
  it("falls back for unrecognized input", () => {
    expect(getRevisionSuggestions("whatever")).toEqual(["Rev 1", "Rev 2", "IFC", "Final"]);
    expect(getRevisionSuggestions("")).toEqual(["Rev 1", "Rev 2", "IFC", "Final"]);
  });
});

describe("matchSheets", () => {
  it("classifies revised / added / removed and sorts by sheet number", () => {
    const oldSheets = [{ sheetNumber: "S1.0" }, { sheetNumber: "S2.0" }];
    const newSheets = [{ sheetNumber: "S1.0", rev: "1" }, { sheetNumber: "S3.0" }];
    const out = matchSheets(oldSheets, newSheets);
    const byNum = Object.fromEntries(out.map((r) => [r.sheetNumber, r.change]));
    expect(byNum["S1.0"]).toBe("revised"); // in both
    expect(byNum["S3.0"]).toBe("added");   // new only
    expect(byNum["S2.0"]).toBe("removed"); // old only
    expect(out.map((r) => r.sheetNumber)).toEqual(["S1.0", "S2.0", "S3.0"]); // sorted
  });
  it("handles empty inputs", () => {
    expect(matchSheets()).toEqual([]);
    expect(matchSheets([{ sheetNumber: "A" }], [])).toEqual([
      { sheetNumber: "A", oldSheet: { sheetNumber: "A" }, newSheet: null, change: "removed" },
    ]);
  });
});
