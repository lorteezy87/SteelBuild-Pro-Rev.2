import { describe, expect, it } from "vitest";
import { compareRfisByNumber, extractRfiSequence } from "../utils";

describe("RFI numeric ordering", () => {
  it("extracts numbers from app-created, imported, and vendor RFI formats", () => {
    expect(extractRfiSequence("RFI #058")).toBe(58);
    expect(extractRfiSequence("058")).toBe(58);
    expect(extractRfiSequence("RFI-058")).toBe(58);
    expect(extractRfiSequence("RFI 058")).toBe(58);
    expect(extractRfiSequence("No number")).toBeNull();
  });

  it("sorts RFI rows by numeric sequence regardless of formatting", () => {
    const sorted = [
      { id: "058", rfi_number: "058" },
      { id: "059", rfi_number: "059" },
      { id: "057", rfi_number: "057" },
      { id: "056", rfi_number: "056" },
      { id: "055", rfi_number: "055" },
      { id: "053", rfi_number: "053" },
      { id: "054", rfi_number: "054" },
    ].sort(compareRfisByNumber);

    expect(sorted.map((rfi) => rfi.rfi_number)).toEqual(["053", "054", "055", "056", "057", "058", "059"]);
  });

  it("keeps unnumbered RFIs after numbered RFIs with deterministic tie breaks", () => {
    const sorted = [
      { id: "late", rfi_number: "Pending RFI", created_date: "2026-05-02T00:00:00Z" },
      { id: "ten", rfi_number: "RFI #010", created_date: "2026-05-01T00:00:00Z" },
      { id: "one", rfi_number: "RFI-001", created_date: "2026-05-01T00:00:00Z" },
      { id: "early", rfi_number: "", created_date: "2026-05-01T00:00:00Z" },
    ].sort(compareRfisByNumber);

    expect(sorted.map((rfi) => rfi.id)).toEqual(["one", "ten", "early", "late"]);
  });
});
