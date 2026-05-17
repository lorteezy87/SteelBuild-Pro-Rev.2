import { describe, it, expect } from "vitest";
import {
  isCommentMarkup,
  getCommentsFromMarkup,
  isOpenComment,
  filterComments,
  computeMarkupStats,
  computeSetMarkupStats,
  formatDateShort,
  statusLabel,
  statusColor,
  suggestMarkupPdfFilename,
} from "../markupPDF.js";

const noteOpen = { id: "1", kind: "note", text: "Check weld", status: "open", created_at: "2026-01-15T10:00:00Z", created_by: "NL" };
const noteAddressed = { id: "2", kind: "note", text: "Fixed", status: "addressed", created_at: "2026-01-16T10:00:00Z" };
const noteRejected = { id: "3", kind: "note", text: "Out of scope", status: "rejected", created_at: "2026-01-17T10:00:00Z" };
const noteEmpty = { id: "4", kind: "note", text: "  " };
const pen = { id: "5", kind: "pen", geom: {} };
const rect = { id: "6", kind: "rect", geom: {} };

describe("isCommentMarkup", () => {
  it("returns true only for note items with non-empty text", () => {
    expect(isCommentMarkup(noteOpen)).toBe(true);
    expect(isCommentMarkup(noteAddressed)).toBe(true);
    expect(isCommentMarkup(noteEmpty)).toBe(false);
    expect(isCommentMarkup(pen)).toBe(false);
    expect(isCommentMarkup(null)).toBe(false);
    expect(isCommentMarkup(undefined)).toBe(false);
  });
});

describe("getCommentsFromMarkup", () => {
  it("extracts only comment-shaped items", () => {
    const items = [noteOpen, pen, noteAddressed, rect, noteEmpty];
    const comments = getCommentsFromMarkup(items);
    expect(comments).toHaveLength(2);
    expect(comments.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("handles null / non-array input", () => {
    expect(getCommentsFromMarkup(null)).toEqual([]);
    expect(getCommentsFromMarkup(undefined)).toEqual([]);
    expect(getCommentsFromMarkup("not-an-array")).toEqual([]);
  });
});

describe("isOpenComment / filterComments", () => {
  it("treats missing status as open", () => {
    expect(isOpenComment({ kind: "note", text: "x" })).toBe(true);
    expect(isOpenComment(noteOpen)).toBe(true);
    expect(isOpenComment(noteAddressed)).toBe(false);
    expect(isOpenComment(noteRejected)).toBe(false);
  });

  it("filters with openOnly=true", () => {
    const all = [noteOpen, noteAddressed, noteRejected];
    expect(filterComments(all, { openOnly: true })).toEqual([noteOpen]);
    expect(filterComments(all, { openOnly: false })).toEqual(all);
    expect(filterComments(all)).toEqual(all);
  });
});

describe("computeMarkupStats", () => {
  it("counts markup totals and comment statuses", () => {
    const stats = computeMarkupStats([noteOpen, noteAddressed, noteRejected, pen, rect]);
    expect(stats).toEqual({
      totalMarkups: 5,
      comments: 3,
      openComments: 1,
      addressedComments: 1,
      rejectedComments: 1,
    });
  });

  it("handles null safely", () => {
    expect(computeMarkupStats(null)).toEqual({
      totalMarkups: 0,
      comments: 0,
      openComments: 0,
      addressedComments: 0,
      rejectedComments: 0,
    });
  });
});

describe("computeSetMarkupStats", () => {
  it("aggregates across sheets", () => {
    const sheets = [
      { id: "a", markup: [noteOpen, pen] },
      { id: "b", markup: [noteAddressed, noteRejected] },
      { id: "c", markup: null },
    ];
    expect(computeSetMarkupStats(sheets)).toEqual({
      sheetCount: 3,
      totalMarkups: 4,
      comments: 3,
      openComments: 1,
      addressedComments: 1,
      rejectedComments: 1,
    });
  });
});

describe("formatDateShort", () => {
  it("returns em-dash for falsy / unparseable", () => {
    expect(formatDateShort(null)).toBe("—");
    expect(formatDateShort(undefined)).toBe("—");
    expect(formatDateShort("not a date")).toBe("—");
  });

  it("formats valid dates", () => {
    const d = new Date("2026-05-03T12:00:00Z");
    const out = formatDateShort(d);
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/May/);
  });
});

describe("statusLabel / statusColor", () => {
  it("normalizes status text", () => {
    expect(statusLabel("open")).toBe("OPEN");
    expect(statusLabel("addressed")).toBe("ADDRESSED");
    expect(statusLabel("rejected")).toBe("REJECTED");
    expect(statusLabel(undefined)).toBe("OPEN");
    expect(statusLabel("ADDRESSED")).toBe("ADDRESSED");
  });

  it("returns RGB triplets", () => {
    expect(statusColor("addressed")).toHaveLength(3);
    expect(statusColor("open")).toHaveLength(3);
    expect(statusColor("anything-else")).toHaveLength(3);
  });
});

describe("suggestMarkupPdfFilename", () => {
  it("includes scope tag and date", () => {
    const now = new Date("2026-05-03T12:00:00Z");
    expect(suggestMarkupPdfFilename({ scope: "drawing", label: "S-001", now })).toBe("S-001_markups_2026-05-03.pdf");
    expect(suggestMarkupPdfFilename({ scope: "set", label: "100% CD", now })).toBe("100_CD_set_markups_2026-05-03.pdf");
  });

  it("falls back when label is empty", () => {
    const now = new Date("2026-05-03T00:00:00Z");
    expect(suggestMarkupPdfFilename({ now })).toBe("drawing_markups_2026-05-03.pdf");
  });
});
