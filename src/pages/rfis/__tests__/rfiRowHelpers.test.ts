import { describe, expect, it } from "vitest";
import {
  rfiAssignedLine,
  rfiPriorityColor,
  rfiReferenceLine,
  rfiRowClassNames,
  rfiSubmittedLine,
} from "../rfiRowHelpers";

describe("rfiRowHelpers", () => {
  it("builds reference, submitted, assigned lines", () => {
    expect(
      rfiReferenceLine({
        discipline: "Structural",
        drawing_reference: "S-101",
        spec_section: "05 12 00",
      }),
    ).toBe("Structural / S-101 / 05 12 00");
    expect(rfiReferenceLine({})).toBe("");
    expect(
      rfiSubmittedLine({ submitted_by: "Alice", submitted_date: "2026-08-01" }),
    ).toBe("Alice / 2026-08-01");
    expect(rfiAssignedLine({ assigned_to: "Bob" })).toBe("Bob");
    expect(rfiAssignedLine({ project_name: "Alpha" })).toBe("Alpha");
    expect(rfiAssignedLine({})).toBe("");
  });

  it("priority color and row class names", () => {
    expect(rfiPriorityColor("Critical")).toBe("var(--status-review)");
    expect(rfiPriorityColor("High")).toBe("var(--status-warning)");
    expect(rfiPriorityColor("Medium")).toBe("var(--status-info)");
    expect(rfiPriorityColor("Low")).toBe("var(--text-muted)");
    expect(
      rfiRowClassNames({ selected: true, overdue: true, priority: "Critical" }),
    ).toBe("rfi-record-row is-selected is-overdue is-critical");
    expect(rfiRowClassNames({})).toBe("rfi-record-row");
  });
});
