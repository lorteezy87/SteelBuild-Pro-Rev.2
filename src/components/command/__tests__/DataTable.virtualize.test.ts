import { describe, it, expect } from "vitest";
import {
  DATA_TABLE_VIRTUALIZE_THRESHOLD,
  shouldVirtualizeDataTable,
} from "../DataTable";

describe("shouldVirtualizeDataTable", () => {
  it("uses the shared 100-row threshold by default", () => {
    expect(DATA_TABLE_VIRTUALIZE_THRESHOLD).toBe(100);
    expect(shouldVirtualizeDataTable(100)).toBe(false);
    expect(shouldVirtualizeDataTable(101)).toBe(true);
    expect(shouldVirtualizeDataTable(0)).toBe(false);
  });

  it("honors a custom threshold", () => {
    expect(shouldVirtualizeDataTable(50, 40)).toBe(true);
    expect(shouldVirtualizeDataTable(40, 40)).toBe(false);
  });
});
