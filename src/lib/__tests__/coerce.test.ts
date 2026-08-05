import { describe, expect, it } from "vitest";
import { asArray, asObject } from "../coerce";

describe("asArray / asObject", () => {
  it("coerces arrays and JSON strings", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray("[1,2]")).toEqual([1, 2]);
    expect(asArray("{}" )).toEqual([]);
    expect(asArray(null)).toEqual([]);
  });
  it("coerces objects", () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
    expect(asObject('{"a":1}')).toEqual({ a: 1 });
    expect(asObject("[]")).toEqual({});
    expect(asObject(null)).toEqual({});
  });
});
