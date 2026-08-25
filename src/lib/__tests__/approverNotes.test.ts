import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_EOR_AOR_LABEL,
  PENDING_EOR_AOR_FLAG,
  collectUnansweredApproverNotes,
  evaluateApproverNotes,
  hasUnansweredApproverNotes,
  parseApproverNotes,
  readApproverNotes,
  serializeApproverNotes,
} from "../approverNotes";

describe("parseApproverNotes", () => {
  it("returns empty for null / blank", () => {
    expect(parseApproverNotes(null)).toEqual([]);
    expect(parseApproverNotes("")).toEqual([]);
    expect(parseApproverNotes([])).toEqual([]);
  });

  it("parses Q&A pairs and drops empty rows", () => {
    expect(
      parseApproverNotes([
        { id: "1", note: "Confirm CJP at B-4?", response: "Use PJP typical" },
        { id: "2", note: "  ", response: "" },
        { note: "Is HSS 6x6 ok?", response: "" },
      ]),
    ).toEqual([
      { id: "1", note: "Confirm CJP at B-4?", response: "Use PJP typical", created_at: null, responded_at: null },
      { id: "an-2", note: "Is HSS 6x6 ok?", response: "", created_at: null, responded_at: null },
    ]);
  });

  it("treats a bare string as an unanswered note", () => {
    expect(parseApproverNotes("Please confirm beam size")).toEqual([
      { id: "legacy-0", note: "Please confirm beam size", response: "" },
    ]);
  });
});

describe("readApproverNotes", () => {
  it("prefers the first-class column, then metadata", () => {
    expect(
      readApproverNotes({
        approver_notes: [{ id: "a", note: "From column", response: "" }],
        metadata: { approver_notes: [{ id: "b", note: "From metadata", response: "" }] },
      }).map((n) => n.note),
    ).toEqual(["From column"]);
    expect(
      readApproverNotes({
        metadata: { approver_notes: [{ id: "b", note: "From metadata", response: "Yes" }] },
      }).map((n) => n.note),
    ).toEqual(["From metadata"]);
  });
});

describe("unanswered / incomplete flag", () => {
  it("flags a note with no response as pending EOR/AOR", () => {
    const status = evaluateApproverNotes([
      { id: "1", note: "Confirm camber?", response: "" },
      { id: "2", note: "Base plate ok?", response: "Approved as shown" },
    ]);
    expect(status.unansweredCount).toBe(1);
    expect(status.complete).toBe(false);
    expect(status.flag).toBe(PENDING_EOR_AOR_FLAG);
    expect(status.label).toBe(INCOMPLETE_EOR_AOR_LABEL);
    expect(collectUnansweredApproverNotes(status.notes).map((n) => n.id)).toEqual(["1"]);
  });

  it("is complete when every note has a response, or when there are no notes", () => {
    expect(evaluateApproverNotes([]).complete).toBe(true);
    expect(evaluateApproverNotes([]).flag).toBeNull();
    expect(
      evaluateApproverNotes([{ id: "1", note: "Confirm camber?", response: "3/4\" OK" }]).complete,
    ).toBe(true);
    expect(hasUnansweredApproverNotes({ approver_notes: [] })).toBe(false);
  });

  it("does not flag a response-only or whitespace-only note", () => {
    expect(
      hasUnansweredApproverNotes([{ id: "1", note: "   ", response: "" }]),
    ).toBe(false);
  });
});

describe("serializeApproverNotes", () => {
  it("trims and drops empty rows", () => {
    expect(
      serializeApproverNotes([
        { id: "1", note: "  Q  ", response: "  A  ", created_at: "t", responded_at: "r" },
        { id: "2", note: "   ", response: "" },
      ]),
    ).toEqual([
      { id: "1", note: "Q", response: "A", created_at: "t", responded_at: "r" },
    ]);
  });
});
