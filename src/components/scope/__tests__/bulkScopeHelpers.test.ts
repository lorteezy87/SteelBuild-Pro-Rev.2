import { describe, expect, it } from "vitest";
import { parseInput } from "../bulkScopeHelpers";

describe("parseInput", () => {
  it("parses line mode", () => {
    const { rows } = parseInput("One\nTwo", "lines", {
      defaultType: "Scope",
      defaultCategory: "Structural",
      addedBy: "me",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].description).toBe("One");
  });
  it("parses csv with description header", () => {
    const { rows, errors } = parseInput(
      "description,type\nBase plates,Scope\n",
      "csv",
      { defaultType: "Scope", defaultCategory: "Structural", addedBy: "me" },
    );
    expect(errors).toEqual([]);
    expect(rows[0].description).toBe("Base plates");
  });
});
