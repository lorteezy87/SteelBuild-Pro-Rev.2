/**
 * `documents.tags` is jsonb but writers have stored it as a JSON *string*, so a
 * row can hold a real array, '["a","b"]', '[]', or a plain comma list.
 *
 * The old normalizer only checked Array.isArray then comma-split the rest, so
 * the JSON text "[]" became the single tag `["[]"]` and rendered literally on
 * every document card. Same string-vs-array duality as email recipients.
 */
import { describe, expect, it } from "vitest";
import { parseTagList, serializeTagList } from "../utils";

describe("parseTagList", () => {
  it("returns no tags for a JSON-encoded empty array (the ['[]'] bug)", () => {
    expect(parseTagList("[]")).toEqual([]);
    expect(parseTagList("  []  ")).toEqual([]);
  });

  it("parses a JSON-encoded array of tags", () => {
    expect(parseTagList('["shop","approved"]')).toEqual(["shop", "approved"]);
  });

  it("passes a real array through, trimming and dropping blanks", () => {
    expect(parseTagList([" shop ", "", "approved"])).toEqual(["shop", "approved"]);
  });

  it("still supports a plain comma-separated list", () => {
    expect(parseTagList("shop, approved ,")).toEqual(["shop", "approved"]);
  });

  it("handles a JSON-encoded single string", () => {
    expect(parseTagList('"shop"')).toEqual(["shop"]);
  });

  it("never surfaces raw brackets or quotes when the JSON is malformed", () => {
    const out = parseTagList('["shop", "approved"');
    expect(out).toEqual(["shop", "approved"]);
    expect(out.join("")).not.toMatch(/[[\]"]/);
  });

  it("returns an empty list for null, undefined, and empty input", () => {
    expect(parseTagList(null)).toEqual([]);
    expect(parseTagList(undefined)).toEqual([]);
    expect(parseTagList("")).toEqual([]);
    expect(parseTagList([])).toEqual([]);
  });
});

describe("parseTagList heals repeatedly-corrupted rows", () => {
  // documents.tags is TEXT but writers sent arrays, so PostgREST stored the
  // array's JSON text and every edit-save round-trip added a layer:
  // [] -> "[]" -> ["[]"] -> ...
  it("unwraps a doubly-encoded empty list to no tags", () => {
    expect(parseTagList('["[]"]')).toEqual([]);
    expect(parseTagList(['[]'])).toEqual([]);
  });

  it("unwraps a doubly-encoded real list", () => {
    expect(parseTagList('["[\\"RFI\\",\\"RFI #042\\"]"]')).toEqual(["RFI", "RFI #042"]);
  });

  it("recovers tags from a JSON array split across elements", () => {
    expect(parseTagList(['["RFI"', '"RFI #042"]'])).toEqual(["RFI", "RFI #042"]);
  });
});

describe("serializeTagList writes what the TEXT column holds", () => {
  it("emits a comma list, not a JS array", () => {
    expect(serializeTagList(["shop", "approved"])).toBe("shop, approved");
    expect(serializeTagList("shop, approved")).toBe("shop, approved");
  });

  it("emits null for an empty list so the column stays NULL, not '[]'", () => {
    expect(serializeTagList([])).toBeNull();
    expect(serializeTagList("")).toBeNull();
    expect(serializeTagList(null)).toBeNull();
    expect(serializeTagList("[]")).toBeNull();
  });

  it("round-trips without accumulating encoding layers", () => {
    let stored = serializeTagList(["shop"]);
    for (let i = 0; i < 5; i++) stored = serializeTagList(parseTagList(stored));
    expect(stored).toBe("shop");
  });
});
