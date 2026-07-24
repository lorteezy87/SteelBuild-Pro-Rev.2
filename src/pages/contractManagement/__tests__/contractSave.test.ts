import { describe, expect, it } from "vitest";
import { buildContractPatch } from "../contractSave";

describe("buildContractPatch", () => {
  it("rejects a blank amount instead of silently saving zero", () => {
    expect(() => buildContractPatch({
      original_contract_value: "",
      contract_type: "Lump Sum",
    })).toThrow("Original contract value is required");
  });

  it("rejects invalid and negative amounts", () => {
    expect(() => buildContractPatch({ original_contract_value: "abc" })).toThrow("valid number");
    expect(() => buildContractPatch({ original_contract_value: "-1" })).toThrow("cannot be negative");
  });

  it("returns a normalized project patch", () => {
    expect(buildContractPatch({
      original_contract_value: "125000.50",
      contract_type: "GMP",
    })).toEqual({
      original_contract_value: 125000.5,
      contract_type: "GMP",
    });
  });
});
