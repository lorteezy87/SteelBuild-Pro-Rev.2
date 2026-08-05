import { describe, expect, it } from "vitest";
import { findById } from "../findById";

describe("findById", () => {
  it("returns matching row by id", () => {
    expect(findById([{ id: "a" }, { id: "b" }], "b")?.id).toBe("b");
  });

  it("returns null for missing id, empty rows, or no match", () => {
    expect(findById([{ id: "a" }], null)).toBeNull();
    expect(findById([{ id: "a" }], undefined)).toBeNull();
    expect(findById([{ id: "a" }], "")).toBeNull();
    expect(findById(null, "a")).toBeNull();
    expect(findById(undefined, "a")).toBeNull();
    expect(findById([{ id: "a" }], "z")).toBeNull();
  });
});
