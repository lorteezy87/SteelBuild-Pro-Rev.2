import { describe, expect, it } from "vitest";
import {
  SCALAR_REFERENCE_COLUMNS,
  assertUuid,
  comparableObjectMetadata,
  destinationPath,
  rewriteAttachmentReferences,
} from "../lib/appFilesLegacyCutover.mjs";

const ORG_ID = "733042ba-4c06-45a9-8ae5-9ff949b6dbb8";

describe("legacy app-files cutover helpers", () => {
  it("uses the complete reviewed scalar reference catalog", () => {
    expect(SCALAR_REFERENCE_COLUMNS).toHaveLength(23);
    expect(SCALAR_REFERENCE_COLUMNS).toContainEqual(["drawings", "file_url"]);
    expect(SCALAR_REFERENCE_COLUMNS).toContainEqual(["deliveries", "shipping_ticket_path"]);
    expect(SCALAR_REFERENCE_COLUMNS).toContainEqual(["user_profiles", "avatar_url"]);
  });

  it("builds a deterministic org-scoped destination", () => {
    expect(destinationPath(ORG_ID, "uploads/example.pdf")).toBe(
      `${ORG_ID}/uploads/example.pdf`,
    );
  });

  it("rejects an invalid org id or a non-legacy source", () => {
    expect(() => assertUuid("not-an-id", "FOUNDING_ORG_ID")).toThrow(/must be a UUID/);
    expect(() => destinationPath(ORG_ID, `${ORG_ID}/uploads/example.pdf`)).toThrow(
      /Not a legacy app-files path/,
    );
  });

  it("rewrites comma-separated attachment tokens without changing filenames", () => {
    const rewritten = rewriteAttachmentReferences(
      " uploads/a.pdf,notes.txt, uploads/b.png ",
      ORG_ID,
    );
    expect(rewritten).toEqual({
      changed: true,
      value: ` ${ORG_ID}/uploads/a.pdf,notes.txt, ${ORG_ID}/uploads/b.png `,
      legacyPaths: ["uploads/a.pdf", "uploads/b.png"],
    });
  });

  it("rewrites nested JSON attachment paths", () => {
    const rewritten = rewriteAttachmentReferences(
      JSON.stringify([{ file_url: "uploads/a.pdf" }, "external.pdf"]),
      ORG_ID,
    );
    expect(JSON.parse(rewritten.value)).toEqual([
      { file_url: `${ORG_ID}/uploads/a.pdf` },
      "external.pdf",
    ]);
    expect(rewritten.legacyPaths).toEqual(["uploads/a.pdf"]);
  });

  it("fails closed for ambiguous embedded legacy paths", () => {
    expect(() => rewriteAttachmentReferences("note: uploads/a.pdf", ORG_ID)).toThrow(
      /embedded uploads\/ path/,
    );
  });

  it("normalizes Storage size and ETag metadata", () => {
    expect(comparableObjectMetadata({ size: 42, etag: '"abc"' })).toEqual({
      size: 42,
      etag: "abc",
    });
    expect(comparableObjectMetadata({ metadata: { size: "11", eTag: "def" } })).toEqual({
      size: 11,
      etag: "def",
    });
  });
});
