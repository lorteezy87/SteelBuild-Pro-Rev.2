import { describe, expect, it } from "vitest";
import { STATUS_ORDER, STATUS_STYLE, mono } from "../projectHandoffChecklistHelpers";

describe("projectHandoffChecklistHelpers", () => {
  it("status order and styles", () => {
    expect(STATUS_ORDER).toContain("Completed");
    expect(STATUS_STYLE.Completed.color).toBe("var(--status-success)");
    expect(STATUS_STYLE["In Progress"].bg).toBe("var(--warning-muted)");
    expect(mono.fontFamily).toBe("var(--font-mono)");
  });
});
