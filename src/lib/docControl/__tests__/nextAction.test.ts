import { describe, expect, it } from "vitest";
import type { DocControlRecord } from "../types";
import { nextActionForRecord } from "../nextAction";

const record = (status: DocControlRecord["register"]["status"]) => ({
  register: { status },
}) as DocControlRecord;

describe("nextActionForRecord", () => {
  it("routes an exact live-register match to revision upload", () => {
    expect(nextActionForRecord(record("revision-of-record"), true)).toMatchObject({
      kind: "start_revision_upload",
      href: "/Drawings",
    });
  });

  it("does not select a target for ambiguous or capped-register evidence", () => {
    expect(nextActionForRecord(record("duplicate-in-register"), true)).toMatchObject({
      kind: "resolve_ambiguity",
      href: null,
    });
    expect(nextActionForRecord(record("register-incomplete"), false)).toMatchObject({
      kind: "review_source_pdf",
      href: null,
    });
  });

  it("routes a verified new sheet to Upload Set", () => {
    expect(nextActionForRecord(record("new-to-register"), true)).toMatchObject({
      kind: "upload_set",
      href: "/Drawings",
    });
  });
});
