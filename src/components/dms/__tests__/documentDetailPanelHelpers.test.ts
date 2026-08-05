import { describe, expect, it } from "vitest";
import {
  buildDocumentVersionStack,
  buildLinkedDocumentEntities,
  fileSizeMbFromKb,
} from "../documentDetailPanelHelpers";

describe("buildDocumentVersionStack", () => {
  it("sorts by revision then date", () => {
    const stack = buildDocumentVersionStack("D-1", [
      { document_number: "D-1", revision_number: "1", created_at: "2026-01-01" },
      { document_number: "D-1", revision_number: "2", created_at: "2026-02-01" },
      { document_number: "D-2", revision_number: "9", created_at: "2026-03-01" },
    ]);
    expect(stack.map((d) => d.revision_number)).toEqual(["2", "1"]);
  });
});

describe("buildLinkedDocumentEntities / fileSize", () => {
  it("extracts linked entity keys", () => {
    const labels = { rfi_id: { label: "RFI", color: "c", bg: "b", border: "x" } };
    expect(buildLinkedDocumentEntities({ rfi_id: "r1" }, labels)[0].value).toBe("r1");
    expect(fileSizeMbFromKb(2048)).toBe("2.0");
  });
});
