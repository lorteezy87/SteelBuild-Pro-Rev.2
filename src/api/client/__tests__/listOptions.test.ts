import { describe, expect, it } from "vitest";
import { LIST_ROW_CAP, resolveListLimit, resolveListReadArgs } from "../listOptions";

describe("resolveListLimit", () => {
  it("defaults to LIST_ROW_CAP", () => {
    expect(resolveListLimit()).toBe(LIST_ROW_CAP);
    expect(resolveListLimit(0)).toBe(LIST_ROW_CAP);
    expect(resolveListLimit(-5)).toBe(LIST_ROW_CAP);
  });

  it("honors a positive explicit limit", () => {
    expect(resolveListLimit(50)).toBe(50);
    expect(resolveListLimit(50.9)).toBe(50);
  });
});

describe("resolveListReadArgs", () => {
  it("treats a numeric second arg as the row cap", () => {
    expect(resolveListReadArgs(50)).toEqual({ limit: 50, columns: undefined });
  });

  it("treats a string second arg as a column list", () => {
    expect(resolveListReadArgs("id,created_at")).toEqual({
      limit: LIST_ROW_CAP,
      columns: "id,created_at",
    });
  });

  it("accepts limit plus columns together", () => {
    expect(resolveListReadArgs(50, "id,created_at")).toEqual({
      limit: 50,
      columns: "id,created_at",
    });
  });
});
