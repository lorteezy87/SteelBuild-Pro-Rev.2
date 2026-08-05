import { describe, expect, it } from "vitest";
import {
  parseBulkDurationValue,
  isBulkDurationValid,
  validateBulkDurationInput,
} from "../bulkDurationEditHelpers";

describe("bulk duration validation", () => {
  it("validates set/add modes", () => {
    expect(validateBulkDurationInput("", "set")).toMatch(/Enter/);
    expect(validateBulkDurationInput("x", "set")).toMatch(/whole number/);
    expect(validateBulkDurationInput("-1", "set")).toMatch(/negative/);
    expect(validateBulkDurationInput("0", "add")).toMatch(/non-zero/);
    expect(validateBulkDurationInput("5", "set")).toBe("");
    expect(isBulkDurationValid("5", "set")).toBe(true);
    expect(parseBulkDurationValue("12")).toBe(12);
  });
});
